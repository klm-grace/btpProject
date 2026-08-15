import { describe, expect, it } from "bun:test";
import { hasBody } from "./stream.ts";

describe("readBodyStream helpers", () => {
  it("hasBody retourne false pour GET sans body", () => {
    const req = new Request("http://localhost/test", { method: "GET" });
    expect(hasBody(req)).toBe(false);
  });

  it("hasBody retourne true pour POST avec body", () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "test",
    });
    expect(hasBody(req)).toBe(true);
  });

  it("hasBody retourne true pour POST avec Content-Length", () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Length": "100" },
    });
    expect(hasBody(req)).toBe(true);
  });

  it("hasBody retourne false pour POST sans body et sans Content-Length", () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
    });
    expect(hasBody(req)).toBe(false);
  });
});
