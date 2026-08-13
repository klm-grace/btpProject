import { describe, expect, it } from "bun:test";
import { defaultHasher, generateToken } from "@libs/auth/password";

describe("password", () => {
  it("hash retourne un hash argon2id", async () => {
    const hash = await defaultHasher.hash("password123");
    expect(hash).toContain("$argon2id$");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verify retourne true pour le bon mot de passe", async () => {
    const hash = await defaultHasher.hash("secret");
    const ok = await defaultHasher.verify("secret", hash);
    expect(ok).toBe(true);
  });

  it("verify retourne false pour le mauvais mot de passe", async () => {
    const hash = await defaultHasher.hash("secret");
    const ok = await defaultHasher.verify("wrong", hash);
    expect(ok).toBe(false);
  });

  it("deux hash du même mot de passe sont différents (salt)", async () => {
    const h1 = await defaultHasher.hash("test");
    const h2 = await defaultHasher.hash("test");
    expect(h1).not.toBe(h2);
    // Mais les deux vérifient
    expect(await defaultHasher.verify("test", h1)).toBe(true);
    expect(await defaultHasher.verify("test", h2)).toBe(true);
  });
});

describe("generateToken", () => {
  it("retourne 64 caractères hex", () => {
    const token = generateToken();
    expect(token.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it("retourne des tokens uniques", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});
