import { describe, expect, it } from "bun:test";
import { createBodyChecker } from "./body.ts";

function makeChecker(opts: { jsonMaxBytes?: number; multipartMaxBytes?: number } = {}) {
  return createBodyChecker({
    jsonMaxBytes: opts.jsonMaxBytes ?? 4096,
    multipartMaxBytes: opts.multipartMaxBytes ?? 10 * 1024 * 1024,
  });
}

function makeRequest(body: string, contentType: string = "application/json"): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": contentType, "Content-Length": Buffer.byteLength(body).toString() },
    body,
  });
}

describe("body checker", () => {
  it("retourne false si Content-Length absent", () => {
    const checker = makeChecker();
    const req = new Request("http://localhost/test", { method: "GET" });
    expect(checker.check(req)).toBe(false);
  });

  it("retourne true si JSON dépasse jsonMaxBytes", () => {
    const checker = makeChecker({ jsonMaxBytes: 100 });
    const req = makeRequest(JSON.stringify({ data: "x".repeat(200) }));
    expect(checker.check(req)).toBe(true);
  });

  it("retourne false si JSON dans la limite", () => {
    const checker = makeChecker({ jsonMaxBytes: 1000 });
    const req = makeRequest(JSON.stringify({ data: "hello" }));
    expect(checker.check(req)).toBe(false);
  });

  it("retourne true si multipart dépasse multipartMaxBytes", () => {
    const checker = makeChecker({ multipartMaxBytes: 100 });
    const req = makeRequest("x".repeat(200), "multipart/form-data; boundary=----FormBoundary");
    expect(checker.check(req)).toBe(true);
  });

  it("retourne false si multipart dans la limite", () => {
    const checker = makeChecker({ multipartMaxBytes: 1024 });
    const req = makeRequest("hello", "multipart/form-data; boundary=----FormBoundary");
    expect(checker.check(req)).toBe(false);
  });

  it("applique la limite multipart par défaut pour text/plain", () => {
    const checker = makeChecker({ multipartMaxBytes: 100 });
    const req = makeRequest("x".repeat(200), "text/plain");
    expect(checker.check(req)).toBe(true);
  });

  it("retourne true si Content-Length invalide (non numerique)", () => {
    const checker = makeChecker();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "abc" },
      body: "test",
    });
    expect(checker.check(req)).toBe(true);
  });
});
