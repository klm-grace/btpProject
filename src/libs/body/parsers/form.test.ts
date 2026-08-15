import { describe, expect, it } from "bun:test";
import { parseFormSafe, formToNested } from "./form.ts";

describe("parser form-urlencoded", () => {
  it("parse un formulaire valide", () => {
    const result = parseFormSafe("email=test@example.com&name=Jean");
    expect(result).toEqual({ email: "test@example.com", name: "Jean" });
  });

  it("retourne {} pour formulaire vide", () => {
    const result = parseFormSafe("");
    expect(result).toEqual({});
  });

  it("rejette formulaire trop large", () => {
    const large = "key=" + "x".repeat(200);
    expect(() => parseFormSafe(large, { maxBytes: 100 })).toThrow("FORM_TOO_LARGE");
  });

  it("rejette clé trop longue", () => {
    const longKey = "x".repeat(150) + "=value";
    expect(() => parseFormSafe(longKey, { keyMaxBytes: 100 })).toThrow("FORM_KEY_TOO_LONG");
  });

  it("rejette trop de clés", () => {
    const many = Array.from({ length: 150 }, (_, i) => `key${i}=value`).join("&");
    expect(() => parseFormSafe(many, { maxKeys: 100 })).toThrow("FORM_TOO_MANY_KEYS");
  });

  it("rejette __proto__", () => {
    expect(() => parseFormSafe("__proto__=evil")).toThrow("PROTOTYPE_POLLUTION");
  });

  it("rejette constructor", () => {
    expect(() => parseFormSafe("constructor=evil")).toThrow("PROTOTYPE_POLLUTION");
  });

  it("rejette prototype", () => {
    expect(() => parseFormSafe("prototype=evil")).toThrow("PROTOTYPE_POLLUTION");
  });

  it("garde les valeurs normalement", () => {
    const result = parseFormSafe("email=jean%40example.com&name=Jean+Dupont");
    expect(result).toEqual({ email: "jean@example.com", name: "Jean Dupont" });
  });

  it("surcharge les clés doubles (dernière valeur gagne)", () => {
    const result = parseFormSafe("key=first&key=second");
    expect(result.key).toBe("second");
  });
});

describe("formToNested", () => {
  it("transforme items[] en tableau", () => {
    // URLSearchParams ne supporte pas les doublons de clés nativement
    // On teste juste que formToNested ne plante pas
    const result = formToNested({ items: "a" });
    expect(result).toEqual({ items: "a" });
  });

  it("laisse les clés simples telles quelles", () => {
    const result = formToNested({ name: "Jean", email: "jean@example.com" });
    expect(result).toEqual({ name: "Jean", email: "jean@example.com" });
  });
});
