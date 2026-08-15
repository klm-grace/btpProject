import { describe, expect, it } from "bun:test";
import { parseJsonSafe, checkJsonDepth, hasPrototypePollution } from "./json.ts";

describe("parser JSON", () => {
  it("parse un JSON valide", () => {
    const result = parseJsonSafe('{"email":"test@example.com","name":"Jean"}');
    expect(result).toEqual({ email: "test@example.com", name: "Jean" });
  });

  it("retourne {} pour JSON vide", () => {
    const result = parseJsonSafe("");
    expect(result).toEqual({});
  });

  it("retourne {} pour JSON whitespace", () => {
    const result = parseJsonSafe("   \n  ");
    expect(result).toEqual({});
  });

  it("rejette JSON malformé", () => {
    expect(() => parseJsonSafe("{ invalid json }")).toThrow("INVALID_JSON");
  });

  it("rejette JSON trop profond", () => {
    const deep = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":1}}}}}}}}}}';
    // Depth = 10, maxDepth = 5 → doit rejeter
    expect(() => parseJsonSafe(deep, { maxDepth: 5 })).toThrow("JSON_MAX_DEPTH");
  });

  it("rejette JSON avec __proto__", () => {
    expect(() => parseJsonSafe('{"__proto__":{"admin":true}}')).toThrow("PROTOTYPE_POLLUTION");
  });

  it("rejette JSON avec constructor", () => {
    expect(() => parseJsonSafe('{"constructor":{"args":"evil"}}')).toThrow("PROTOTYPE_POLLUTION");
  });

  it("rejette JSON avec prototype", () => {
    expect(() => parseJsonSafe('{"prototype":"evil"}')).toThrow("PROTOTYPE_POLLUTION");
  });

  it("rejette JSON trop large", () => {
    const large = JSON.stringify({ data: "x".repeat(200) });
    expect(() => parseJsonSafe(large, { maxBytes: 100 })).toThrow("BODY_TOO_LARGE");
  });

  it("accepte JSON profond si sous la limite", () => {
    const deep = '{"a":{"b":{"c":{"d":{"e":1}}}}}';
    const result = parseJsonSafe(deep, { maxDepth: 10 });
    expect(result).toEqual({ a: { b: { c: { d: { e: 1 } } } } });
  });

  it("rejette les tableaux JSON (pas un objet)", () => {
    expect(() => parseJsonSafe('[1,2,3]')).toThrow("INVALID_JSON");
  });

  it("rejette les strings JSON", () => {
    expect(() => parseJsonSafe('"hello"')).toThrow("INVALID_JSON");
  });

  it("rejette les null JSON", () => {
    expect(() => parseJsonSafe('null')).toThrow("INVALID_JSON");
  });

  it("rejette prototype pollution imbriquée", () => {
    expect(() => parseJsonSafe('{"data":{"__proto__":{"admin":true}}}')).toThrow("PROTOTYPE_POLLUTION");
  });

  it("checkJsonDepth accepte profondeur normale", () => {
    expect(() => checkJsonDepth('{"a":{"b":1}}', 5)).not.toThrow();
  });

  it("checkJsonDepth rejette profondeur trop grande", () => {
    expect(() => checkJsonDepth('{"a":{"b":{"c":{"d":{"e":{"f":1}}}}}}', 3)).toThrow("JSON_MAX_DEPTH");
  });

  it("checkJsonDepth ignore les chaînes", () => {
    // Une chaîne avec des {} dedans ne compte pas
    expect(() => checkJsonDepth('{"a":"{\\\\\"b\\\\\":1}"}', 1)).not.toThrow();
  });
});
