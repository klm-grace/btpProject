import { describe, expect, it } from "bun:test";
import { parseTextSafe } from "./text.ts";

describe("parser text/plain", () => {
  it("parse un texte valide", () => {
    const result = parseTextSafe("Bonjour tout le monde");
    expect(result).toBe("Bonjour tout le monde");
  });

  it("retourne une chaîne vide pour texte vide", () => {
    const result = parseTextSafe("");
    expect(result).toBe("");
  });

  it("rejette texte trop long", () => {
    expect(() => parseTextSafe("x".repeat(200), { maxBytes: 100 })).toThrow("TEXT_TOO_LARGE");
  });

  it("conserve les espaces et sauts de ligne", () => {
    const text = "Ligne 1\nLigne 2\tTabulé";
    const result = parseTextSafe(text);
    expect(result).toBe(text);
  });
});
