import { describe, expect, it } from "bun:test";
import { createConfig } from "@libs/config";

const valid: RawEnv = {
  NODE_ENV: "development",
  PORT: "4000",
  HOST: "127.0.0.1",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
  REDIS_URL: "redis://127.0.0.1:6379",
};

describe("config", () => {
  const cfg = createConfig();

  it("parse une configuration valide", () => {
    const c = cfg.parse(valid);
    expect(c.env).toBe("development");
    expect(c.server.port).toBe(4000);
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.log.level).toBe("info");
    expect(c.db.url).toBe(valid.DATABASE_URL!);
    expect(c.redis.url).toBe(valid.REDIS_URL!);
    expect(c.sessionSecret).toBe("");
    expect(c.sessionExpiryHours).toBe(24);
    expect(c.bruteForceMaxAttempts).toBe(5);
    expect(c.mfaIssuer).toBe("BTP Project");
  });

  it("applique les défauts quand absent", () => {
    const c = cfg.parse({
      DATABASE_URL: valid.DATABASE_URL,
      REDIS_URL: valid.REDIS_URL,
    });
    expect(c.server.port).toBe(4000);
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.env).toBe("development");
    expect(c.log.level).toBe("info");
  });

  it("lit le nom de variable identique en dev/prod (contrat env)", () => {
    const prod = cfg.parse({
      ...valid,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://prod:hidden@db.example.com:5432/prod",
      REDIS_URL: "redis://redis.example.com:6379",
      PORT: "443",
      SESSION_SECRET: "a".repeat(32),
    });
    expect(prod.env).toBe("production");
    expect(prod.db.url).toContain("db.example.com");
    expect(prod.server.port).toBe(443);
  });

  it("exige SESSION_SECRET en production", () => {
    const r = cfg.validate({
      ...valid,
      NODE_ENV: "production",
      SESSION_SECRET: "trop-court",
    });
    expect(r.ok).toBe(false);
  });

  it("accepte SESSION_SECRET court en dev (défaut si absent)", () => {
    const r = cfg.validate(valid);
    expect(r.ok).toBe(true);
  });

  it("rejette une DATABASE_URL invalide", () => {
    const r = cfg.validate({ ...valid, DATABASE_URL: "pas-une-url" });
    expect(r.ok).toBe(false);
  });

  it("rejette un PORT invalide", () => {
    const r = cfg.validate({ ...valid, PORT: "abc" });
    expect(r.ok).toBe(false);
  });

  it("rejette une variable manquante", () => {
    const r = cfg.validate({ NODE_ENV: "development" });
    expect(r.ok).toBe(false);
  });

  it("rejette un LOG_LEVEL invalide", () => {
    const r = cfg.validate({ ...valid, LOG_LEVEL: "chattons" });
    expect(r.ok).toBe(false);
  });
});
