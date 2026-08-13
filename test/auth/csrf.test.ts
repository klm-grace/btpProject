import { describe, expect, it } from "bun:test";
import { generateCsrfToken, verifyCsrfToken } from "@libs/auth/session";

describe("CSRF", () => {
  it("generateCsrfToken retourne 64 caractères hex", () => {
    const token = generateCsrfToken();
    expect(token.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it("generateCsrfToken retourne des tokens uniques", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateCsrfToken()));
    expect(tokens.size).toBe(50);
  });

  it("verifyCsrfToken retourne true si les deux tokens sont identiques", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it("verifyCsrfToken retourne false si les tokens diffèrent", () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(verifyCsrfToken(t1, t2)).toBe(false);
  });

  it("verifyCsrfToken retourne false si un token est vide", () => {
    expect(verifyCsrfToken("", "abc")).toBe(false);
    expect(verifyCsrfToken("abc", "")).toBe(false);
    expect(verifyCsrfToken("", "")).toBe(false);
  });

  it("verifyCsrfToken retourne false si les longueurs diffèrent", () => {
    expect(verifyCsrfToken("short", "a-much-longer-token")).toBe(false);
  });
});
