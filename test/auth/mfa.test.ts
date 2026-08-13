import { describe, expect, it } from "bun:test";
import { generateSecret, getOtpauthUri, verifyCode } from "@libs/auth/mfa";
import { generateTotpCode } from "./helpers/totp";

describe("mfa", () => {
  it("generateSecret retourne une chaîne base32 de 32 caractères", () => {
    const secret = generateSecret();
    expect(secret.length).toBe(32);
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

  it("verifyCode accepte un code TOTP réellement généré (RFC 6238)", () => {
    const secret = generateSecret();
    const code = generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyCode(secret, code)).toBe(true);
  });

  it("verifyCode accepte un code TOTP de l'instant précédent (fenêtre ±1)", () => {
    const secret = generateSecret();
    // 30 secondes dans le passé (même pas ou pas précédent selon l'alignement)
    const code = generateTotpCode(secret, Math.floor(Date.now() / 1000) - 30);
    expect(verifyCode(secret, code)).toBe(true);
  });

  it("verifyCode échoue sur un code invalide", () => {
    const secret = generateSecret();
    expect(verifyCode(secret, "000000")).toBe(false);
    expect(verifyCode(secret, "abc123")).toBe(false);
    expect(verifyCode(secret, "")).toBe(false);
    expect(verifyCode(secret, "1234567")).toBe(false); // 7 chiffres
  });
});
