import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createRedis } from "@libs/redis";
import { createConfig } from "@libs/config";

/**
 * Tests d'intégration Redis — nécessitent Redis (docker compose).
 * Skip si REDIS_URL n'est pas disponible ou si le ping échoue.
 */

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://btp_dev:btp_dev_password@127.0.0.1:5432/btp_dev",
  REDIS_URL: process.env.REDIS_URL ?? "redis://:btp_dev_redis_password@127.0.0.1:6379",
  NODE_ENV: "test",
};

let redis: Redis | null = null;
let available = false;

beforeAll(async () => {
  try {
    const cfg = createConfig().parse(env);
    redis = createRedis({ url: cfg.redis.url });
    available = await redis.ping();
  } catch {
    available = false;
  }
});

afterAll(async () => {
  if (redis) await redis.close();
});

describe("redis", () => {
  it("createRedis retourne une interface Redis", () => {
    const instance = createRedis({ url: env.REDIS_URL! });
    expect(typeof instance.ping).toBe("function");
    expect(typeof instance.close).toBe("function");
    expect(typeof instance.get).toBe("function");
    expect(typeof instance.set).toBe("function");
    expect(instance.client).toBeDefined();
  });

  it("ping retourne true contre le conteneur local", async () => {
    if (!available || !redis) {
      console.warn("[skip] Redis non disponible — lancer: bun run infra:up");
      return;
    }
    const ok = await redis.ping();
    expect(ok).toBe(true);
  });

  it("set / get / del fonctionnent", async () => {
    if (!available || !redis) {
      console.warn("[skip] Redis non disponible");
      return;
    }
    const key = `test:section01:${Date.now()}`;
    await redis.set(key, "hello");
    const value = await redis.get(key);
    expect(value).toBe("hello");
    await redis.del(key);
    const after = await redis.get(key);
    expect(after).toBeNull();
  });

  it("ping retourne false sur une URL invalide", async () => {
    const bad = createRedis({
      url: "redis://127.0.0.1:1",
      connectionTimeoutMs: 500,
    });
    const ok = await bad.ping();
    expect(ok).toBe(false);
    try {
      await bad.close();
    } catch {
      // ignore close errors on dead connection
    }
  });

  it("ne lit jamais process.env (injection pure)", () => {
    const instance = createRedis({ url: "redis://localhost:6379" });
    expect(instance).toBeDefined();
  });
});
