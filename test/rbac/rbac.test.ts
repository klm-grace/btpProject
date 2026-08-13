import { describe, expect, it, beforeEach } from "bun:test";
import { createRbac } from "@libs/rbac";
import type { RbacDeps, RbacUser } from "@libs/rbac/types";
import { createRouter } from "@libs/router";
import { jsonOk } from "@libs/http";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDeps(permissionsByUser: Record<string, string[]>): RbacDeps {
  return {
    sessionReader: async (req: Request): Promise<RbacUser | null> => {
      const sid = req.headers.get("cookie")?.match(/sid=([^;]*)/)?.[1];
      if (!sid) return null;
      if (sid === "valid") {
        return { id: "u1", email: "admin@test.com", roles: ["admin"] };
      }
      if (sid === "viewer") {
        return { id: "u2", email: "viewer@test.com", roles: ["viewer"] };
      }
      return null; // tout autre cookie → session invalide
    },
    db: {
      sql: {
        async unsafe<T = Record<string, unknown>>(sqlStr: string, params?: unknown[]): Promise<T[]> {
          // Retourne les permissions de l'utilisateur du cache mock
          const userId = String(params?.[0] ?? "");
          const perms = permissionsByUser[userId] ?? [];
          return perms.map((name) => ({ name })) as T[];
        },
      },
    },
  };
}

function buildReq(method: string, url: string, headers?: Record<string, string>): Request {
  return new Request(url, { method, headers });
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ── createRbac : cache + checkPermission ────────────────────────────────────

describe("createRbac", () => {
  let deps: RbacDeps;

  beforeEach(() => {
    deps = makeDeps({
      u1: ["users.read", "users.write", "content.read"],
      u2: ["content.read"],
    });
  });

  it("checkPermission accorde la permission présente", async () => {
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const user: RbacUser = { id: "u1", email: "a@b.c", roles: ["admin"] };
    const check = await rbac.checkPermission(user, "users.write");
    expect(check).toEqual({ allowed: true });
  });

  it("checkPermission refuse la permission absente", async () => {
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const user: RbacUser = { id: "u1", email: "a@b.c", roles: ["admin"] };
    const check = await rbac.checkPermission(user, "settings.manage");
    expect(check).toEqual({ allowed: false, code: "forbidden", message: "Forbidden" });
  });

  it("getUserPermissions charge depuis la DB et met en cache", async () => {
    let dbCalls = 0;
    const depsWithCount: RbacDeps = {
      sessionReader: deps.sessionReader,
      db: {
        sql: {
          async unsafe<T = Record<string, unknown>>(sqlStr: string, params?: unknown[]): Promise<T[]> {
            dbCalls++;
            const perms = ["content.read"];
            return perms.map((name) => ({ name })) as T[];
          },
        },
      },
    };
    const rbac = createRbac(depsWithCount, { cacheTtlMs: 60_000 });
    await rbac.getUserPermissions("u9");
    await rbac.getUserPermissions("u9");
    await rbac.getUserPermissions("u9");
    expect(dbCalls).toBe(1); // une seule requête DB (cache)
  });

  it("invalidate vide le cache d'un utilisateur", async () => {
    let dbCalls = 0;
    const depsWithCount: RbacDeps = {
      sessionReader: deps.sessionReader,
      db: {
        sql: {
          async unsafe<T = Record<string, unknown>>(sqlStr: string, params?: unknown[]): Promise<T[]> {
            dbCalls++;
            return [{ name: "users.read" }] as T[];
          },
        },
      },
    };
    const rbac = createRbac(depsWithCount, { cacheTtlMs: 60_000 });
    await rbac.getUserPermissions("u1");
    await rbac.getUserPermissions("u1");
    expect(dbCalls).toBe(1);
    rbac.invalidate("u1");
    await rbac.getUserPermissions("u1");
    expect(dbCalls).toBe(2);
  });
});

// ── Middlewares : requireAuth, requirePermission ─────────────────────────────

describe("rbac middlewares", () => {
  it("requireAuth : sans cookie → 401", async () => {
    const deps = makeDeps({});
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.get("/api/secret", async (_req, ctx) => {
      return jsonOk({ user: ctx.state.user });
    });
    // Applique le middleware requireAuth sur la route via use()
    router.use(rbac.requireAuth);
    const res = await router.handle(buildReq("GET", "http://localhost/api/secret"));
    expect(res.status).toBe(401);
  });

  it("requireAuth : avec cookie valide → ctx.state.user rempli", async () => {
    const deps = makeDeps({});
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.use(rbac.requireAuth);
    let seenUser: unknown = null;
    router.get("/api/secret", (_req, ctx) => {
      seenUser = ctx.state.user;
      return jsonOk({ ok: true });
    });
    const res = await router.handle(
      buildReq("GET", "http://localhost/api/secret", { Cookie: "sid=valid" }),
    );
    expect(res.status).toBe(200);
    expect(seenUser).toMatchObject({ id: "u1", email: "admin@test.com" });
  });

  it("requirePermission : accordé → handler exécuté", async () => {
    const deps = makeDeps({ u1: ["content.read"] });
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.use(rbac.requireAuth);
    router.use(rbac.requirePermission("content.read"));
    router.get("/api/content", () => jsonOk({ ok: true }));
    const res = await router.handle(
      buildReq("GET", "http://localhost/api/content", { Cookie: "sid=valid" }),
    );
    expect(res.status).toBe(200);
  });

  it("requirePermission : refusé → 403", async () => {
    const deps = makeDeps({ u1: ["content.read"] });
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.use(rbac.requireAuth);
    router.use(rbac.requirePermission("content.write"));
    router.get("/api/content", () => jsonOk({ ok: true }));
    const res = await router.handle(
      buildReq("GET", "http://localhost/api/content", { Cookie: "sid=valid" }),
    );
    expect(res.status).toBe(403);
  });

  it("requirePermission : sans session (mais un cookie invalide) → 401", async () => {
    const deps = makeDeps({});
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.use(rbac.requireAuth);
    router.use(rbac.requirePermission("content.read"));
    router.get("/api/content", () => jsonOk({ ok: true }));
    const res = await router.handle(
      buildReq("GET", "http://localhost/api/content", { Cookie: "sid=invalide" }),
    );
    expect(res.status).toBe(401);
  });

  it("requireResourcePermission : accordé quand le checker ressource est OK", async () => {
    const deps = makeDeps({ u1: ["content.write"] });
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.use(rbac.requireAuth);
    router.use(rbac.requireResourcePermission("content.write", async () => true));
    router.put("/api/content/:id", () => jsonOk({ ok: true }));
    const res = await router.handle(
      buildReq("PUT", "http://localhost/api/content/abc", { Cookie: "sid=valid" }),
    );
    expect(res.status).toBe(200);
  });

  it("requireResourcePermission : refusé quand le checker ressource est KO", async () => {
    const deps = makeDeps({ u1: ["content.write"] });
    const rbac = createRbac(deps, { cacheTtlMs: 60_000 });
    const router = createRouter();
    router.use(rbac.requireAuth);
    router.use(rbac.requireResourcePermission("content.write", async () => false));
    router.put("/api/content/:id", () => jsonOk({ ok: true }));
    const res = await router.handle(
      buildReq("PUT", "http://localhost/api/content/abc", { Cookie: "sid=valid" }),
    );
    expect(res.status).toBe(403);
  });
});
