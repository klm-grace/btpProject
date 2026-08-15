import { describe, expect, it } from "bun:test";
import { createBodyMiddleware, type BodyCheckerConfig } from "./body.ts";

function makeMiddleware(opts: Partial<BodyCheckerConfig> = {}) {
  return createBodyMiddleware({
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

function makeCtx() {
  return {
    params: {},
    query: new URLSearchParams(),
    requestId: "test-request-id",
    method: "POST" as const,
    path: "/test",
    state: {},
    signal: new AbortController().signal,
  };
}

describe("body middleware", () => {
  it("passe à next() si body vide", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", { method: "GET" });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });

  it("retourne 413 si JSON dépasse jsonMaxBytes", async () => {
    const mw = makeMiddleware({ jsonMaxBytes: 100 });
    const req = makeRequest(JSON.stringify({ data: "x".repeat(200) }));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("BODY_TOO_LARGE");
  });

  it("passe si JSON dans la limite", async () => {
    const mw = makeMiddleware({ jsonMaxBytes: 1000 });
    const req = makeRequest(JSON.stringify({ data: "hello" }));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });

  it("retourne 413 si multipart dépasse multipartMaxBytes", async () => {
    const mw = makeMiddleware({ multipartMaxBytes: 100 });
    const req = makeRequest("x".repeat(200), "multipart/form-data; boundary=----FormBoundary");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
  });

  it("passe si multipart dans la limite", async () => {
    const mw = makeMiddleware({ multipartMaxBytes: 1024 });
    const req = makeRequest("hello", "multipart/form-data; boundary=----FormBoundary");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });

  it("applique la limite multipart par défaut pour text/plain", async () => {
    const mw = makeMiddleware({ multipartMaxBytes: 100 });
    const req = makeRequest("x".repeat(200), "text/plain");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
  });

  it("retourne 400 si Content-Length invalide (non numerique)", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "abc" },
      body: "test",
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
  });

  it("passe si Content-Length absent (streaming)", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "test",
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });
});
