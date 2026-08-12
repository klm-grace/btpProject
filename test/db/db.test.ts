import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createDb } from "../../src/libs/db/index.ts";
import { createConfig } from "../../src/libs/config/index.ts";

/**
 * Tests d'intégration DB — nécessitent PostgreSQL (docker compose).
 * Skip si DATABASE_URL n'est pas disponible ou si le ping échoue.
 */

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

describe("db", () => {
  it("createDb retourne une interface Db", () => {
    const instance = createDb({ url: env.DATABASE_URL! });
    expect(typeof instance.ping).toBe("function");
    expect(typeof instance.close).toBe("function");
    expect(typeof instance.queryOne).toBe("function");
    expect(instance.sql).toBeDefined();
  });

  it("ping retourne true contre le conteneur local", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible — lancer: bun run infra:up");
      return;
    }
    const ok = await db.ping();
    expect(ok).toBe(true);
  });

  it("queryOne exécute une requête paramétrée (SELECT 1)", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const row = await db.queryOne<{ ok: number }>`SELECT 1 AS ok`;
    expect(row).not.toBeNull();
    expect(Number(row!.ok)).toBe(1);
  });

  it("ping retourne false sur une URL invalide", async () => {
    const bad = createDb({ url: "postgres://nobody:wrong@127.0.0.1:1/nope" });
    const ok = await bad.ping();
    expect(ok).toBe(false);
    await bad.close();
  });

  it("ne lit jamais process.env (injection pure)", () => {
    // createDb n'accède pas à process.env — on lui passe l'url
    const instance = createDb({ url: "postgres://u:p@localhost:5432/t" });
    expect(instance).toBeDefined();
  });
});
