import { describe, expect, it } from "bun:test";
import { createBodyMiddleware } from "./body.ts";

function makeMiddleware(opts: { jsonMaxBytes?: number; multipartMaxBytes?: number } = {}) {
  return createBodyMiddleware({
    jsonMaxBytes: opts.jsonMaxBytes ?? 4096,
    multipartMaxBytes: opts.multipartMaxBytes ?? 10 * 1024 * 1024,
  });
}

function makeCtx() {
  return {
    params: {},
    query: new URLSearchParams(),
    requestId: "test-request-id",
    method: "POST" as const,
    path: "/test",
    state: {} as Record<string, unknown>,
    signal: new AbortController().signal,
  };
}

function makeJsonRequest(body: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString() },
    body,
  });
}

describe("body middleware", () => {
  it("passe à next() pour les GET (pas de body)", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", { method: "GET" });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });

  it("parse le JSON et attache ctx.state.body", async () => {
    const mw = makeMiddleware();
    const req = makeJsonRequest(JSON.stringify({ email: "test@example.com", password: "secret" }));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toEqual({ email: "test@example.com", password: "secret" });
  });

  it("retourne 400 si JSON malformé", async () => {
    const mw = makeMiddleware();
    const req = makeJsonRequest("{ invalid json }");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("retourne 413 si JSON dépasse jsonMaxBytes", async () => {
    const mw = makeMiddleware({ jsonMaxBytes: 100 });
    const req = makeJsonRequest(JSON.stringify({ data: "x".repeat(200) }));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("BODY_TOO_LARGE");
  });

  it("rejette la prototype pollution (__proto__)", async () => {
    const mw = makeMiddleware();
    // Utiliser JSON.parse direct pour éviter que JS ne supprime la clé __proto__
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "35" },
      body: '{"__proto__":{"admin":true}}',
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("PROTOTYPE_POLLUTION");
  });

  it("rejette la prototype pollution (constructor)", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "36" },
      body: '{"constructor":{"args":"evil"}}',
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("PROTOTYPE_POLLUTION");
  });

  it("rejette la prototype pollution (prototype)", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "32" },
      body: '{"prototype":"evil"}',
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("PROTOTYPE_POLLUTION");
  });

  it("accepte un JSON normal sans clé interdite", async () => {
    const mw = makeMiddleware();
    const req = makeJsonRequest(JSON.stringify({ name: "Jean", email: "jean@example.com" }));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toEqual({ name: "Jean", email: "jean@example.com" });
  });

  it("retourne 400 si Content-Length invalide", async () => {
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

  it("retourne {} si body JSON vide", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "0" },
      body: "",
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toEqual({});
  });

  it("ne parse pas le multipart (laisse au handler)", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=----FormBoundary", "Content-Length": "100" },
      body: "test",
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toBeUndefined();
  });

  it("rejette multipart trop gros", async () => {
    const mw = makeMiddleware({ multipartMaxBytes: 100 });
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=----FormBoundary", "Content-Length": "200" },
      body: "x".repeat(200),
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
  });
});
