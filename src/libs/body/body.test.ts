import { describe, expect, it } from "bun:test";
import { createBodyMiddleware } from "./body.ts";

function makeMiddleware(opts: {
  jsonMaxBytes?: number;
  multipartMaxBytes?: number;
  jsonMaxDepth?: number;
  formMaxBytes?: number;
  formMaxKeys?: number;
  formKeyMaxBytes?: number;
  textMaxBytes?: number;
  xmlMaxBytes?: number;
  xmlMaxDepth?: number;
  xmlMaxElements?: number;
  readTimeoutMs?: number;
} = {}) {
  return createBodyMiddleware({
    jsonMaxBytes: opts.jsonMaxBytes ?? 4096,
    multipartMaxBytes: opts.multipartMaxBytes ?? 10 * 1024 * 1024,
    jsonMaxDepth: opts.jsonMaxDepth ?? 32,
    formMaxBytes: opts.formMaxBytes ?? 4096,
    formMaxKeys: opts.formMaxKeys ?? 100,
    formKeyMaxBytes: opts.formKeyMaxBytes ?? 100,
    textMaxBytes: opts.textMaxBytes ?? 1024,
    xmlMaxBytes: opts.xmlMaxBytes ?? 100 * 1024,
    xmlMaxDepth: opts.xmlMaxDepth ?? 16,
    xmlMaxElements: opts.xmlMaxElements ?? 1000,
    readTimeoutMs: opts.readTimeoutMs ?? 5000,
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

function makeFormRequest(body: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body).toString() },
    body,
  });
}

function makeTextRequest(body: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body).toString() },
    body,
  });
}

function makeXmlRequest(body: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/xml", "Content-Length": Buffer.byteLength(body).toString() },
    body,
  });
}

function makeMultipartRequest(): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=----FormBoundary",
      "Content-Length": "200",
    },
    body: "test",
  });
}

describe("body middleware — intégration", () => {
  it("passe à next() pour les GET", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", { method: "GET" });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
  });

  it("passe à next() pour les requêtes sans Content-Type", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", { method: "POST" });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(true);
  });

  // ── JSON ──────────────────────────────────────────────────────────────
  it("parse JSON et attache ctx.state.body", async () => {
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

  it("retourne 413 si JSON trop grand", async () => {
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

  it("rejette prototype pollution JSON", async () => {
    const mw = makeMiddleware();
    const req = makeJsonRequest('{"__proto__":{"admin":true}}');
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("PROTOTYPE_POLLUTION");
  });

  it("rejette JSON depth excessif", async () => {
    const mw = makeMiddleware({ jsonMaxDepth: 3 });
    const req = makeJsonRequest('{"a":{"b":{"c":{"d":{"e":1}}}}}');
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("JSON_MAX_DEPTH");
  });

  it("retourne {} si JSON vide", async () => {
    const mw = makeMiddleware();
    const req = makeJsonRequest("");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toEqual({});
  });

  it("inclut requestId dans les erreurs JSON", async () => {
    const mw = makeMiddleware();
    const req = makeJsonRequest("{ invalid }");
    const ctx = makeCtx();
    ctx.requestId = "req-123";
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    const body = JSON.parse(await res.text()) as { error: { code: string; requestId: string } };
    expect(body.error.requestId).toBe("req-123");
  });

  // ── Form-urlencoded ───────────────────────────────────────────────────
  it("parse form-urlencoded et attache ctx.state.body", async () => {
    const mw = makeMiddleware();
    const req = makeFormRequest("email=test@example.com&name=Jean");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toEqual({ email: "test@example.com", name: "Jean" });
  });

  it("rejette form trop grand (Content-Length)", async () => {
    const mw = makeMiddleware({ formMaxBytes: 100 });
    const req = makeFormRequest("key=" + "x".repeat(200));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("BODY_TOO_LARGE");
  });

  it("rejette trop de clés form", async () => {
    const mw = makeMiddleware({ formMaxKeys: 2 });
    const req = makeFormRequest("a=1&b=2&c=3");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("FORM_TOO_MANY_KEYS");
  });

  it("rejette clé form trop longue", async () => {
    const mw = makeMiddleware({ formKeyMaxBytes: 5 });
    const req = makeFormRequest("averylongkey=value");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("FORM_KEY_TOO_LONG");
  });

  it("rejette prototype pollution form", async () => {
    const mw = makeMiddleware();
    const req = makeFormRequest("__proto__=evil");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("PROTOTYPE_POLLUTION");
  });

  // ── Text/plain ────────────────────────────────────────────────────────
  it("parse text/plain et attache ctx.state.body", async () => {
    const mw = makeMiddleware();
    const req = makeTextRequest("Bonjour le monde");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toBe("Bonjour le monde");
  });

  it("rejette text trop grand (Content-Length)", async () => {
    const mw = makeMiddleware({ textMaxBytes: 50 });
    const req = makeTextRequest("x".repeat(200));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("BODY_TOO_LARGE");
  });

  // ── XML ───────────────────────────────────────────────────────────────
  it("parse XML et attache ctx.state.body", async () => {
    const mw = makeMiddleware();
    const req = makeXmlRequest("<root><name>Jean</name></root>");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toBeDefined();
  });

  it("rejette XML avec DOCTYPE (XXE)", async () => {
    const mw = makeMiddleware();
    const req = makeXmlRequest('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>');
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("XML_DOCTYPE_NOT_ALLOWED");
  });

  it("rejette XML avec entité externe (DOCTYPE bloqué en premier)", async () => {
    const mw = makeMiddleware();
    const req = makeXmlRequest('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://evil.com">]>');
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("XML_DOCTYPE_NOT_ALLOWED");
  });

  it("rejette XML trop profond", async () => {
    const mw = makeMiddleware({ xmlMaxDepth: 3 });
    const req = makeXmlRequest("<a>".repeat(10) + "text" + "</a>".repeat(10));
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("XML_MAX_DEPTH");
  });

  it("rejette XML trop complexe", async () => {
    const mw = makeMiddleware({ xmlMaxElements: 10 });
    const req = makeXmlRequest("<root>" + Array.from({ length: 20 }, (_, i) => `<item>${i}</item>`).join("") + "</root>");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("XML_TOO_COMPLEX");
  });

  it("rejette XML trop grand (Content-Length)", async () => {
    const mw = makeMiddleware({ xmlMaxBytes: 50 });
    const req = makeXmlRequest("<root>" + "x".repeat(200) + "</root>");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("BODY_TOO_LARGE");
  });

  // ── Multipart ─────────────────────────────────────────────────────────
  it("skip multipart et laisse le handler parser", async () => {
    const mw = makeMiddleware();
    const req = makeMultipartRequest();
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toBeUndefined();
  });

  it("rejette multipart trop grand", async () => {
    const mw = makeMiddleware({ multipartMaxBytes: 100 });
    const req = makeMultipartRequest();
    req.headers.set("content-length", "200");
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(413);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("BODY_TOO_LARGE");
  });

  // ── Chunked ───────────────────────────────────────────────────────────
  it("rejette Transfer-Encoding: chunked", async () => {
    const mw = makeMiddleware();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
      body: '{"email":"test@example.com"}',
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    const res = await mw(req, ctx, next);
    expect(called).toBe(false);
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("CHUNKED_ENCODING_NOT_ALLOWED");
  });

  // ── Content-Length invalide ───────────────────────────────────────────
  it("rejette Content-Length invalide", async () => {
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
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_CONTENT_LENGTH");
  });

  // ── Text sans Content-Length ─────────────────────────────────────────
  it("lit le body sans Content-Length pour JSON", async () => {
    const mw = makeMiddleware({ jsonMaxBytes: 4096 });
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email":"test@example.com"}',
    });
    const ctx = makeCtx();
    let called = false;
    const next = () => { called = true; return Promise.resolve(new Response("ok")); };
    await mw(req, ctx, next);
    expect(called).toBe(true);
    expect(ctx.state.body).toEqual({ email: "test@example.com" });
  });
});
