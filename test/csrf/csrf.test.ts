import { describe, expect, it } from "bun:test";
import { createCsrf } from "@libs/csrf";

describe("csrf", () => {
  const csrf = createCsrf();

  it("generate retourne 64 caractères hex", () => {
    const token = csrf.generate();
    expect(token.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it("generate retourne des tokens uniques", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => csrf.generate()));
    expect(tokens.size).toBe(50);
  });

  it("verify retourne true si les deux tokens sont identiques", () => {
    const token = csrf.generate();
    expect(csrf.verify(token, token)).toBe(true);
  });

  it("verify retourne false si les tokens diffèrent", () => {
    const t1 = csrf.generate();
    const t2 = csrf.generate();
    expect(csrf.verify(t1, t2)).toBe(false);
  });

  it("verify retourne false si un token est vide", () => {
    expect(csrf.verify("", "abc")).toBe(false);
    expect(csrf.verify("abc", "")).toBe(false);
    expect(csrf.verify("", "")).toBe(false);
  });

  it("verify retourne false si les longueurs diffèrent", () => {
    expect(csrf.verify("short", "a-much-longer-token")).toBe(false);
  });
});
