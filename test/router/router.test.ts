import { describe, expect, it } from "bun:test";
import { createRouter } from "@libs/router";
import { jsonOk } from "@libs/http";

function buildReq(method: string, url: string, headers?: Record<string, string>): Request {
  return new Request(url, { method, headers });
}

describe("router", () => {
  it("dispatche une route GET", async () => {
    const router = createRouter();
    router.get("/api/health", () => jsonOk({ ok: true }));
    const res = await router.handle(buildReq("GET", "http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { ok: boolean } };
    expect(body).toEqual({ success: true, data: { ok: true } });
  });

  it("404 propre quand la route n'existe pas", async () => {
    const router = createRouter();
    const res = await router.handle(buildReq("GET", "http://localhost/nope"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("not_found");
  });

  it("405 quand la méthode n'est pas supportée", async () => {
    const router = createRouter();
    router.get("/api/items", () => jsonOk([]));
    const res = await router.handle(buildReq("POST", "http://localhost/api/items"));
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
    expect(res.headers.get("Allow")).toBe("GET");
  });

  it("extrait les paramètres de chemin", async () => {
    const router = createRouter();
    let captured: Record<string, string> = {};
    router.get("/api/items/:id", (_req, ctx) => {
      captured = ctx.params;
      return jsonOk({ id: ctx.params.id });
    });
    const res = await router.handle(buildReq("GET", "http://localhost/api/items/abc-123"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBe("abc-123");
    expect(captured.id).toBe("abc-123");
  });

  it("route statique matche avant route paramétrée", async () => {
    const router = createRouter();
    router.get("/api/items/new", () => jsonOk({ kind: "new" }));
    router.get("/api/items/:id", (_req, ctx) => jsonOk({ kind: "param", id: ctx.params.id }));
    const res = await router.handle(buildReq("GET", "http://localhost/api/items/new"));
    const body = (await res.json()) as { data: { kind: string } };
    expect(body.data.kind).toBe("new");
  });

  it("expose la query string décodée", async () => {
    const router = createRouter();
    let q = "";
    router.get("/api/items", (_req, ctx) => {
      q = ctx.query.toString();
      return jsonOk([]);
    });
    await router.handle(buildReq("GET", "http://localhost/api/items?page=2&pageSize=20"));
    expect(q).toBe("page=2&pageSize=20");
  });

  it("rejette un chemin avec segments vides (double slash)", async () => {
    const router = createRouter();
    router.get("/api/health", () => jsonOk({}));
    const res = await router.handle(buildReq("GET", "http://localhost/api//health"));
    expect(res.status).toBe(400);
  });

  it("rejette le path traversal (./../)", async () => {
    const router = createRouter();
    router.get("/api/files/:name", (_req, ctx) => jsonOk({ name: ctx.params.name }));
    const res = await router.handle(buildReq("GET", "http://localhost/api/files/.."));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  it("rejette l'encodage malformé", async () => {
    const router = createRouter();
    router.get("/api/items/:id", () => jsonOk({}));
    const res = await router.handle(buildReq("GET", "http://localhost/api/items/%ZZ"));
    expect(res.status).toBe(400);
  });

  it("rejette les chemins trop longs (>1024)", async () => {
    const router = createRouter({ maxPathLength: 100 });
    const long = "/" + "a".repeat(200);
    const res = await router.handle(buildReq("GET", `http://localhost${long}`));
    expect(res.status).toBe(414);
  });

  it("erreur au démarrage si route dupliquée", () => {
    const router = createRouter();
    router.get("/api/health", () => jsonOk({}));
    expect(() => router.get("/api/health", () => jsonOk({}))).toThrow(/dupliquée/);
  });

  it("rejette les chemins invalides à l'enregistrement", () => {
    const router = createRouter();
    expect(() => router.get("/api/../admin", () => jsonOk({}))).toThrow(/invalide/);
  });

  it("génère un requestId par requête", async () => {
    const router = createRouter();
    let captured = "";
    router.get("/api/health", (_req, ctx) => {
      captured = ctx.requestId;
      return jsonOk({});
    });
    await router.handle(buildReq("GET", "http://localhost/api/health"));
    expect(captured.length).toBeGreaterThan(0);
  });

  it("respecte le requestId fourni dans x-request-id", async () => {
    const router = createRouter();
    let captured = "";
    router.get("/api/health", (_req, ctx) => {
      captured = ctx.requestId;
      return jsonOk({});
    });
    await router.handle(buildReq("GET", "http://localhost/api/health", { "x-request-id": "my-trace-1" }));
    expect(captured).toBe("my-trace-1");
  });
});
