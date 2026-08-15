import { describe, expect, it, beforeEach } from "bun:test";
import { createAdminRateLimiter } from "./admin-rate-limit.ts";
import type { AdminRateLimitConfig, AdminRateLimitDeps } from "./types.ts";

describe("AdminRateLimiter — Doubling ban", () => {
  let store: Record<string, string> = {};
  let deps: AdminRateLimitDeps;
  let limiter: ReturnType<typeof createAdminRateLimiter>;

  const config: AdminRateLimitConfig = {
    maxRequests: 3,
    windowSeconds: 60,
    baseBanHours: 1,
    maxBanHours: 8,
  };

  function reset() {
    store = {};
    deps = {
      redis: {
        async get(key: string): Promise<string | null> {
          return store[key] ?? null;
        },
        async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
          store[key] = value;
        },
        async del(...keys: string[]): Promise<void> {
          for (const k of keys) delete store[k];
        },
      },
    };
    limiter = createAdminRateLimiter(deps, config);
  }

  beforeEach(reset);

  it("autorise les 3 premières requêtes", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await limiter.check("192.168.1.1", "/api/admin/users")).allowed).toBe(true);
    }
  });

  it("bloque la 4ème requête avec ban 1h", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check("192.168.1.1", "/api/admin/users");
    }
    const r = await limiter.check("192.168.1.1", "/api/admin/users");
    expect(r.allowed).toBe(false);
    expect(r.ban?.banned).toBe(true);
    expect(r.ban?.violations).toBe(1);
    expect(r.ban?.retryAfterSeconds).toBeGreaterThan(3400);
    expect(r.ban?.retryAfterSeconds).toBeLessThan(3800);
  });

  it("clearBan remet à zéro", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check("10.0.0.2", "/test");
    }
    await limiter.check("10.0.0.2", "/test");
    expect((await limiter.check("10.0.0.2", "/test")).allowed).toBe(false);

    await limiter.clearBan("10.0.0.2");
    expect((await limiter.check("10.0.0.2", "/test")).allowed).toBe(true);
  });

  it("different IPs sont indépendants", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check("10.0.0.3", "/test");
    }
    await limiter.check("10.0.0.3", "/test");
    expect((await limiter.check("10.0.0.3", "/test")).allowed).toBe(false);
    expect((await limiter.check("10.0.0.4", "/test")).allowed).toBe(true);
  });

  it("doubling: violation 1 = 1h, violation 2 = 2h après clear", async () => {
    // Première violation
    for (let i = 0; i < 3; i++) await limiter.check("10.0.0.5", "/test");
    await limiter.check("10.0.0.5", "/test");
    let r = await limiter.check("10.0.0.5", "/test");
    expect(r.ban?.violations).toBe(1);
    const ban1 = r.ban!.retryAfterSeconds;

    // Clear et nouvelle violation
    await limiter.clearBan("10.0.0.5");
    for (let i = 0; i < 3; i++) await limiter.check("10.0.0.5", "/test");
    await limiter.check("10.0.0.5", "/test");
    r = await limiter.check("10.0.0.5", "/test");
    expect(r.ban?.violations).toBe(2);
    const ban2 = r.ban!.retryAfterSeconds;

    // Le ban 2 devrait être ~2x le ban 1
    expect(ban2).toBeGreaterThanOrEqual(ban1 * 1.8);
    expect(ban2).toBeLessThanOrEqual(ban1 * 2.2);
  });
});
