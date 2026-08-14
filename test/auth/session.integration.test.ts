import { describe, expect, it, beforeEach } from "bun:test";
import { createSessionStore } from "@libs/auth/session";
import { createBruteForceStore } from "@libs/auth/brute-force";
import { createAuth } from "@libs/auth";
import type { AuthConfig, AuthDeps, AuthUser, Redis } from "@libs/auth/types";

// ── Mocks in-memory (sans infra) ─────────────────────────────────────────────

function createMemoryRedis() {
  const store = new Map<string, string>();
  const mockRedisClient = {
    connected: true,
    connect: async () => {},
    close: () => {},
    ping: async () => "PONG",
    set: async () => {},
    get: async () => null as string | null,
    del: async () => {},
  };
  return {
    redis: {
      async get(key: string) { return store.get(key) ?? null; },
      async set(key: string, value: string, ttlSeconds?: number) { store.set(key, value); },
      async del(...keys: string[]) { for (const k of keys) store.delete(k); },
      async ping() { return true; },
      async close() {},
      client: mockRedisClient,
    } as unknown as Redis,
    store,
  };
}

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
};

function createMemoryDb() {
  const users = new Map<string, Record<string, unknown>>();
  const sessions: SessionRow[] = [];
  const roles = new Map<string, string[]>();

  const queryOne = async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ): Promise<T | null> => {
    const sql = strings.join("?");
    const p = params as unknown[];

    // SELECT ... FROM users WHERE id = ?::uuid AND deleted_at IS NULL
    if (sql.includes("FROM users") && sql.includes("id = ?") && sql.includes("deleted_at IS NULL")) {
      const id = String(p[0]);
      const u = users.get(id);
      return u && u.deleted_at === null ? (u as T) : null;
    }

    // SELECT ... FROM users WHERE email = ? AND deleted_at IS NULL
    if (sql.includes("FROM users") && sql.includes("email") && sql.includes("deleted_at IS NULL")) {
      const email = String(p[0]);
      for (const u of users.values()) {
        if (u.email === email && u.deleted_at === null) return u as T;
      }
      return null;
    }

    // SELECT user_id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
    if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
      const hash = String(p[0]);
      const row = sessions.find(
        (s) => s.token_hash === hash && s.revoked_at === null && new Date(s.expires_at) > new Date(),
      );
      return row ? ({ user_id: row.user_id } as T) : null;
    }

    // SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?::uuid
    if (sql.includes("mfa_secret") && sql.includes("FROM users")) {
      const id = String(p[0]);
      const u = users.get(id);
      return u ? ({ mfa_secret: u.mfa_secret ?? null, mfa_enabled: u.mfa_enabled ?? false } as T) : null;
    }

    // SELECT email, mfa_enabled FROM users WHERE id = ?::uuid AND deleted_at IS NULL
    if (sql.includes("FROM users") && sql.includes("id = ?") && sql.includes("email")) {
      const id = String(p[0]);
      const u = users.get(id);
      return u ? ({ email: u.email, mfa_enabled: u.mfa_enabled ?? false } as T) : null;
    }

    // SELECT email, status, first_name, last_name, mfa_enabled, mfa_secret FROM users WHERE id = ?::uuid AND deleted_at IS NULL
    if (sql.includes("FROM users") && sql.includes("status") && sql.includes("mfa_enabled")) {
      const id = String(p[0]);
      const u = users.get(id);
      return u ? (u as T) : null;
    }

    // SELECT password_hash FROM users WHERE id = ?::uuid AND deleted_at IS NULL
    if (sql.includes("password_hash") && sql.includes("FROM users") && !sql.includes("UPDATE")) {
      const id = String(p[0]);
      const u = users.get(id);
      return u ? ({ password_hash: u.password_hash } as T) : null;
    }

    return null;
  };

  const sql = {
    async unsafe<T = Record<string, unknown>>(sqlStr: string, params?: unknown[]): Promise<T[]> {
      const p = params ?? [];

      // INSERT INTO sessions ...
      if (sqlStr.includes("INSERT INTO sessions")) {
        sessions.push({
          id: "s" + sessions.length + 1,
          user_id: String(p[0]),
          token_hash: String(p[1]),
          expires_at: String(p[4]),
          revoked_at: null,
        });
        return [] as T[];
      }

      // DELETE FROM sessions (old path, kept for compat)
      if (sqlStr.includes("DELETE FROM sessions")) {
        const userId = String(p[0]);
        const idx = sessions.findIndex((s) => s.user_id === userId);
        if (idx >= 0) sessions.splice(idx, 1);
        return [] as T[];
      }

      // UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL
      if (sqlStr.includes("UPDATE sessions") && sqlStr.includes("token_hash")) {
        const hash = String(p[0]);
        const row = sessions.find((s) => s.token_hash === hash && s.revoked_at === null);
        if (row) row.revoked_at = new Date().toISOString();
        return [] as T[];
      }

      // UPDATE sessions SET revoked_at = NOW() WHERE user_id = ?::uuid AND revoked_at IS NULL
      if (sqlStr.includes("UPDATE sessions") && sqlStr.includes("user_id")) {
        const userId = String(p[0]);
        for (const s of sessions) {
          if (s.user_id === userId && s.revoked_at === null) s.revoked_at = new Date().toISOString();
        }
        return [] as T[];
      }

      // UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid
      if (sqlStr.includes("UPDATE users SET password_hash")) {
        const u = users.get(String(p[1]));
        if (u) u.password_hash = String(p[0]);
        return [] as T[];
      }

      // UPDATE users SET mfa_enabled = true, mfa_secret = $1 ...
      if (sqlStr.includes("UPDATE users SET mfa_enabled = true")) {
        const u = users.get(String(p[1]));
        if (u) { u.mfa_enabled = true; u.mfa_secret = String(p[0]); }
        return [] as T[];
      }

      // UPDATE users SET mfa_enabled = false, mfa_secret = NULL ...
      if (sqlStr.includes("UPDATE users SET mfa_enabled = false")) {
        const u = users.get(String(p[0]));
        if (u) { u.mfa_enabled = false; u.mfa_secret = null; }
        return [] as T[];
      }

      // SELECT r.name FROM roles r ...
      if (sqlStr.includes("SELECT r.name FROM roles r")) {
        const userId = String(p[0]);
        const userRoles = roles.get(userId) ?? [];
        return userRoles.map((name) => ({ name })) as T[];
      }

      return [] as T[];
    },
  };

  return {
    db: { queryOne, sql },
    users,
    sessions,
    roles,
    addUser(id: string, email: string, passwordHash: string, opts: Record<string, unknown> = {}) {
      const u = {
        id, email, password_hash: passwordHash, status: "active",
        first_name: null, last_name: null, mfa_enabled: false, mfa_secret: null,
        deleted_at: null, ...opts,
      };
      users.set(id, u);
      roles.set(id, ["admin"]);
      return u;
    },
  };
}

function makeAuth(mocks: ReturnType<typeof createMemoryDb> & { redis: ReturnType<typeof createMemoryRedis>["redis"] }) {
  const config: AuthConfig = {
    sessionSecret: "test-secret-0123456789abcdef",
    sessionExpiryHours: 24,
    mfaIssuer: "Test App",
    bruteForceMaxAttempts: 3,
    bruteForceLockoutHours: 1,
  };
  const deps: AuthDeps = {
    db: mocks.db,
    redis: mocks.redis,
    hasher: {
      async hash(p) { return `argon2id:${p}`; },
      async verify(p, hash) { return hash === `argon2id:${p}`; },
    },
    tokenGenerator: (() => { let i = 0; return () => `token-${++i}`; })(),
  };
  return createAuth(deps, config);
}

// ── Session store ────────────────────────────────────────────────────────────

describe("session store", () => {
  let mocks: ReturnType<typeof createMemoryDb> & { redis: ReturnType<typeof createMemoryRedis>["redis"] };

  beforeEach(() => {
    mocks = { ...createMemoryDb(), ...createMemoryRedis() };
  });

  it("create puis verify → utilisateur retourné", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:pass");
    const store = createSessionStore({ db: mocks.db, redis: mocks.redis }, { sessionSecret: "s3cr3t" });
    await store.create("u1", "tok123", 1, {});
    const user = await store.verify("tok123");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("admin@test.com");
    expect(user!.roles).toEqual(["admin"]);
  });

  it("verify après révocation → null (logout)", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:pass");
    const store = createSessionStore({ db: mocks.db, redis: mocks.redis }, { sessionSecret: "s3cr3t" });
    await store.create("u1", "tok123", 1, {});
    await store.destroy("tok123");
    expect(await store.verify("tok123")).toBeNull();
  });

  it("verify d'un token inconnu → null", async () => {
    const store = createSessionStore({ db: mocks.db, redis: mocks.redis }, { sessionSecret: "s3cr3t" });
    expect(await store.verify("nope")).toBeNull();
  });

  it("destroyAll révoque toutes les sessions de l'utilisateur", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:pass");
    const store = createSessionStore({ db: mocks.db, redis: mocks.redis }, { sessionSecret: "s3cr3t" });
    await store.create("u1", "tok1", 1, {});
    await store.create("u1", "tok2", 1, {});
    await store.destroyAll("u1");
    expect(await store.verify("tok1")).toBeNull();
    expect(await store.verify("tok2")).toBeNull();
  });

  it("deux sessions d'un même user sont indépendantes", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:pass");
    const store = createSessionStore({ db: mocks.db, redis: mocks.redis }, { sessionSecret: "s3cr3t" });
    await store.create("u1", "tokA", 1, {});
    await store.create("u1", "tokB", 1, {});
    await store.destroy("tokA");
    expect(await store.verify("tokA")).toBeNull();
    expect(await store.verify("tokB")).not.toBeNull();
  });
});

// ── Brute-force ──────────────────────────────────────────────────────────────

describe("brute-force", () => {
  let mocks: ReturnType<typeof createMemoryDb> & { redis: ReturnType<typeof createMemoryRedis>["redis"] };

  beforeEach(() => {
    mocks = { ...createMemoryDb(), ...createMemoryRedis() };
  });

  it("lock après maxAttempts échecs", async () => {
    const bf = createBruteForceStore({ redis: mocks.redis }, { maxAttempts: 3, lockoutHours: 1 });
    expect((await bf.check("a@b.c")).locked).toBe(false);
    await bf.recordFailure("a@b.c");
    await bf.recordFailure("a@b.c");
    expect((await bf.check("a@b.c")).locked).toBe(false);
    await bf.recordFailure("a@b.c");
    expect((await bf.check("a@b.c")).locked).toBe(true);
  });

  it("reset déverrouille", async () => {
    const bf = createBruteForceStore({ redis: mocks.redis }, { maxAttempts: 3, lockoutHours: 1 });
    await bf.recordFailure("a@b.c");
    await bf.recordFailure("a@b.c");
    await bf.recordFailure("a@b.c");
    expect((await bf.check("a@b.c")).locked).toBe(true);
    await bf.reset("a@b.c");
    expect((await bf.check("a@b.c")).locked).toBe(false);
  });
});

// ── createAuth : flux complet ────────────────────────────────────────────────

describe("createAuth login/logout", () => {
  let mocks: ReturnType<typeof createMemoryDb> & { redis: ReturnType<typeof createMemoryRedis>["redis"] };

  beforeEach(() => {
    mocks = { ...createMemoryDb(), ...createMemoryRedis() };
  });

  it("login valide → session + utilisateur", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:correct-password");
    const auth = makeAuth(mocks);
    const result = await auth.login("ADMIN@test.com", "correct-password", { ip: "127.0.0.1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.user.email).toBe("admin@test.com");
      expect(result.user.roles).toContain("admin");
      const session = await auth.getSession(result.token);
      expect(session?.email).toBe("admin@test.com");
    }
  });

  it("login invalide → invalid_credentials (message générique)", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:correct-password");
    const auth = makeAuth(mocks);
    const result = await auth.login("admin@test.com", "wrong-password");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("invalid_credentials");
  });

  it("login sur email inexistant → invalid_credentials (pas d'énumération)", async () => {
    const auth = makeAuth(mocks);
    const result = await auth.login("ghost@test.com", "whatever");
    expect(result.success).toBe(false);
  });

  it("login bloqué après trop d'échecs → brute_force_lockout", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:ok");
    const auth = makeAuth(mocks);
    for (let i = 0; i < 3; i++) {
      await auth.login("admin@test.com", "wrong");
    }
    const result = await auth.login("admin@test.com", "ok");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("brute_force_lockout");
  });

  it("login avec MFA → mfa_required, puis completeMfaLogin avec mauvais code → échec", async () => {
    // Activer MFA avec un vrai secret
    mocks.addUser("u1", "admin@test.com", "argon2id:ok", { mfa_enabled: true, mfa_secret: "JBSWY3DPEHPK3PXP" });
    const auth = makeAuth(mocks);
    const result = await auth.login("admin@test.com", "ok");
    expect(result.success).toBe(false);
    if (!result.success && result.error === "mfa_required") {
      expect(result.pendingToken).toBeDefined();
      const bad = await auth.completeMfaLogin(result.pendingToken!, "000000");
      expect(bad.success).toBe(false);
    } else {
      throw new Error("attendu mfa_required");
    }
  });

  it("changePassword : ancien mot de passe invalide → erreur", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:old");
    const auth = makeAuth(mocks);
    const res = await auth.changePassword("u1", "wrong", "newpassword123");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid_current_password");
  });

  it("changePassword : succès → sessions révoquées", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:old");
    const auth = makeAuth(mocks);
    const login = await auth.login("admin@test.com", "old");
    expect(login.success).toBe(true);
    const token = login.success ? login.token : "";
    const res = await auth.changePassword("u1", "old", "newpassword123");
    expect(res.ok).toBe(true);
    expect(await auth.getSession(token)).toBeNull();
  });

  it("login effectue une rotation de session : l'ancien token est invalidate apres un nouveau login", async () => {
    mocks.addUser("u1", "admin@test.com", "argon2id:correct-password");
    const auth = makeAuth(mocks);
    // Premiere connexion
    const first = await auth.login("admin@test.com", "correct-password");
    expect(first.success).toBe(true);
    const firstToken = first.success ? first.token : "";
    expect(await auth.getSession(firstToken)).not.toBeNull();
    // Deuxieme connexion (rotation)
    const second = await auth.login("admin@test.com", "correct-password");
    expect(second.success).toBe(true);
    const secondToken = second.success ? second.token : "";
    // Ancien token invalide
    expect(await auth.getSession(firstToken)).toBeNull();
    // Nouveau token valide
    expect(await auth.getSession(secondToken)).not.toBeNull();
    // destroyAllSessions expose sur l'engine
    expect(typeof auth.destroyAllSessions).toBe("function");
  });
});
