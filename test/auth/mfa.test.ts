import { describe, expect, it, beforeEach } from "bun:test";
import { generateSecret, getOtpauthUri, verifyCode } from "@libs/auth/mfa";
import { generateTotpCode } from "./helpers/totp";
import type { Redis } from "@libs/redis";

describe("mfa", () => {
  let redis: Redis;

  beforeEach(async () => {
    // On utilise un client Redis fictif pour les tests unitaires.
    redis = {
      get: async () => null,
      set: async () => {},
      del: async () => {},
      ping: async () => true,
      close: async () => {},
      client: {
        connected: true,
        connect: async () => {},
        close: () => {},
        ping: async () => "PONG",
        set: async () => {},
        get: async () => null,
        del: async () => {},
      },
    };
  });

  it("generateSecret retourne une chaîne base32 de 20 caractères", () => {
    const secret = generateSecret();
    expect(secret.length).toBe(20);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it("getOtpauthUri contient le secret, issuer et email encodés", () => {
    const uri = getOtpauthUri("JBSWY3DPEHPK3PXP", "user@test.com", "Mon App");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Mon%20App");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
  });

  it("verifyCode accepte un code TOTP réellement généré (RFC 6238)", async () => {
    const secret = generateSecret();
    const code = generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyCode(secret, code, "test-user", redis)).toBe(true);
  });

  it("verifyCode accepte un code TOTP de l'instant précédent (fenêtre ±1)", async () => {
    const secret = generateSecret();
    const code = generateTotpCode(secret, Math.floor(Date.now() / 1000) - 30);
    expect(await verifyCode(secret, code, "test-user", redis)).toBe(true);
  });

  it("verifyCode échoue sur un code invalide", async () => {
    const secret = generateSecret();
    expect(await verifyCode(secret, "000000", "test-user", redis)).toBe(false);
    expect(await verifyCode(secret, "abc123", "test-user", redis)).toBe(false);
    expect(await verifyCode(secret, "", "test-user", redis)).toBe(false);
    expect(await verifyCode(secret, "1234567", "test-user", redis)).toBe(false);
  });

  it("verifyCode empêche le rejeu du même code", async () => {
    const secret = generateSecret();
    const code = generateTotpCode(secret);
    let setCalled = false;
    let getCalledValue: string | null = null;

    const mockRedis: Redis = {
      get: async (key: string) => {
        if (key.includes("used_step")) return getCalledValue;
        return null;
      },
      set: async (key: string, value: string) => {
        setCalled = true;
        getCalledValue = value;
      },
      del: async () => {},
      ping: async () => true,
      close: async () => {},
      client: {
        connected: true,
        connect: async () => {},
        close: () => {},
        ping: async () => "PONG",
        set: async () => {},
        get: async () => null,
        del: async () => {},
      },
    };

    // Première tentative : OK
    const first = await verifyCode(secret, code, "test-user", mockRedis);
    expect(first).toBe(true);
    expect(setCalled).toBe(true);

    // Deuxième tentative avec le même code : Échec (Rejeu)
    const second = await verifyCode(secret, code, "test-user", mockRedis);
    expect(second).toBe(false);
  });
});
