import { describe, expect, it } from "bun:test";
import { timingSafeEqual } from "@libs/http-security/timing-safe";

describe("timing-safe", () => {
  it("égales → true", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("différentes même longueur → false", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("longueurs différentes → false", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("chaînes vides → true", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("caractères unicode → compare les octets", () => {
    expect(timingSafeEqual("héllo", "héllo")).toBe(true);
    expect(timingSafeEqual("héllo", "hello")).toBe(false);
  });

  it("chaîne vide vs non vide → false", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
    expect(timingSafeEqual("a", "")).toBe(false);
  });
});
