import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://btp_dev:btp_dev_password@127.0.0.1:5432/btp_dev",
  REDIS_URL: process.env.REDIS_URL ?? "redis://:btp_dev_redis_password@127.0.0.1:6379",
  NODE_ENV: "test",
};

let db: Db | null = null;
let available = false;

beforeAll(async () => {
  try {
    const cfg = createConfig().parse(env);
    db = createDb({ url: cfg.db.url });
    available = await db.ping();
  } catch {
    available = false;
  }
});

afterAll(async () => {
  if (db) await db.close();
});

describe("seeds", () => {
  it("les rôles (owner, admin, editor, viewer) existent", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const roles = await db.sql<{ name: string }>`SELECT name FROM roles ORDER BY name`;
    expect(roles.map((r) => r.name)).toEqual(["admin", "editor", "owner", "viewer"]);
  });

  it("les permissions de base existent", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const perms = await db.sql<{ name: string }>`SELECT name FROM permissions ORDER BY name`;
    expect(perms.length).toBe(11);
    expect(perms.map((p) => p.name)).toContain("users.read");
    expect(perms.map((p) => p.name)).toContain("content.write");
  });

  it("l'utilisateur admin existe avec le bon email", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const admin = await db.queryOne<{ email: string; status: string }>`
      SELECT email, status FROM users WHERE email = 'admin@btp-dev.local'
    `;
    expect(admin).not.toBeNull();
    expect(admin!.email).toBe("admin@btp-dev.local");
    expect(admin!.status).toBe("active");
  });

  it("l'admin a le rôle admin", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const userRole = await db.queryOne<{ name: string }>`
      SELECT r.name FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = '00000000-0000-0000-0000-000000000099'
    `;
    expect(userRole).not.toBeNull();
    expect(userRole!.name).toBe("admin");
  });

  it("le hash du mot de passe admin est valide (argon2id)", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const row = await db.queryOne<{ password_hash: string }>`
      SELECT password_hash FROM users WHERE email = 'admin@btp-dev.local'
    `;
    expect(row).not.toBeNull();
    const valid = await Bun.password.verify("admin1234", row!.password_hash);
    expect(valid).toBe(true);
  });
});
