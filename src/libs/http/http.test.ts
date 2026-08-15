import { describe, expect, it } from "bun:test";
import {
  json,
  jsonOk,
  jsonError,
  jsonErrorResponse,
  jsonPaginated,
  jsonStream,
} from "./http.ts";

async function parseResponse(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return {
    status: res.status,
    body: JSON.parse(await res.text()) as Record<string, unknown>,
  };
}

describe("json() — helper principal", () => {
  it("succès simple → 200 avec envelope", async () => {
    const res = json({ token: "abc" });
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { token: "abc" } });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("succès avec status custom", async () => {
    const res = json({ id: 1 }, 201);
    expect(res.status).toBe(201);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, data: { id: 1 } });
  });

  it("succès avec options", async () => {
    const res = json({ user: { id: 1 } }, { status: 200, requestId: "req-123", meta: { key: "val" } });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, data: { user: { id: 1 } }, requestId: "req-123", meta: { key: "val" } });
  });

  it("erreur simple → 400 avec envelope", async () => {
    const res = json({ error: "Invalid credentials" }, 401);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: { code: "error", message: "Invalid credentials" } });
  });

  it("erreur avec code explicite", async () => {
    const res = json({ error: "Session expired" }, 401, { code: "SESSION_EXPIRED" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: false, error: { code: "SESSION_EXPIRED", message: "Session expired" } });
  });

  it("erreur sans status → 400 par défaut", async () => {
    const res = json({ error: "Bad request" });
    expect(res.status).toBe(400);
  });

  it("ne fuit pas de données sensibles", async () => {
    const res = json({ password: "secret123" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.data.password).toBe("secret123");
    // Le handler doit choisir de ne pas inclure le password
  });
});

describe("jsonOk() — succès explicite", () => {
  it("retourne { success: true, data }", async () => {
    const res = jsonOk({ id: 1, name: "Jean" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, data: { id: 1, name: "Jean" } });
  });

  it("accepte un status custom", async () => {
    const res = jsonOk({ id: 1 }, 201);
    expect(res.status).toBe(201);
  });

  it("injecte requestId si fourni", async () => {
    const res = jsonOk({ id: 1 }, { requestId: "req-456" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.requestId).toBe("req-456");
  });

  it("injecte meta si fourni", async () => {
    const res = jsonOk([1, 2, 3], { meta: { page: 1 } });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.meta).toEqual({ page: 1 });
  });

  it("Content-Type correct", async () => {
    const res = jsonOk({ a: 1 });
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("jsonError() — erreur explicite", () => {
  it("retourne { success: false, error: { code, message } }", async () => {
    const res = jsonError({ code: "AUTH_FAILED", message: "Invalid credentials" }, 401);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: false, error: { code: "AUTH_FAILED", message: "Invalid credentials" } });
    expect(res.status).toBe(401);
  });

  it("default status 400", async () => {
    const res = jsonError({ code: "BAD_REQUEST", message: "..." });
    expect(res.status).toBe(400);
  });

  it("injecte requestId si fourni", async () => {
    const res = jsonError({ code: "ERR", message: "msg", requestId: "req-789" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.error.requestId).toBe("req-789");
  });

  it("injecte details si fournis", async () => {
    const res = jsonError({ code: "VALIDATION", message: "Invalid", details: { field: "email" } });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.error.details).toEqual({ field: "email" });
  });
});

describe("jsonErrorResponse() — alias deprecated", () => {
  it("comportement identique à jsonError", async () => {
    const res = jsonErrorResponse({ code: "TEST", message: "msg" }, 422);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: false, error: { code: "TEST", message: "msg" } });
    expect(res.status).toBe(422);
  });
});

describe("jsonPaginated() — pagination", () => {
  it("retourne { success: true, data, meta: { page, pageSize, total, totalPages } }", async () => {
    const res = jsonPaginated([1, 2, 3], 1, 10, 25);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.data).toEqual([1, 2, 3]);
    expect(body.meta).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
  });

  it("total = 0 → totalPages = 0", async () => {
    const res = jsonPaginated([], 1, 10, 0);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.meta.totalPages).toBe(0);
  });

  it("respecte les options", async () => {
    const res = jsonPaginated([1], 1, 10, 1, { requestId: "req-1" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.requestId).toBe("req-1");
  });
});

describe("jsonStream() — streaming", () => {
  it("string body", async () => {
    const res = jsonStream("hello world", { contentType: "text/plain" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("hello world");
  });

  it("Blob body", async () => {
    const blob = new Blob(["image data"], { type: "image/png" });
    const res = jsonStream(blob, { contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
  });

  it("Uint8Array body", async () => {
    const buf = new Uint8Array([1, 2, 3]);
    const res = jsonStream(buf, { contentType: "application/octet-stream" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
  });

  it("ReadableStream body", async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("chunk1")); controller.close(); },
    });
    const res = jsonStream(stream, { contentType: "application/octet-stream" });
    expect(res.status).toBe(200);
  });

  it("status custom", async () => {
    const res = jsonStream("data", { status: 206, contentType: "text/plain" });
    expect(res.status).toBe(206);
  });
});

describe("sécurité — fuites de données", () => {
  it("jsonOk ne fuit pas de stack trace", async () => {
    const err = new Error("Database connection failed: postgres://admin:pass@db:5432");
    const res = jsonError({ code: "DB_ERROR", message: "Query failed" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.error.message).toBe("Query failed");
    expect(body.error.message).not.toContain("postgres");
  });

  it("json() ne fuit pas de credentials", async () => {
    const res = json({ error: "Auth failed" }, 401, { code: "AUTH_FAILED" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body).toEqual({ success: false, error: { code: "AUTH_FAILED", message: "Auth failed" } });
  });
});

describe("sérialisation sûre", () => {
  it("BigInt → string", async () => {
    const res = jsonOk({ count: BigInt(9007199254740991) });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.data.count).toBe("9007199254740991");
  });

  it("cycle → [Circular]", async () => {
    const cyc: any = { name: "test" };
    cyc.self = cyc;
    const res = jsonOk(cyc);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.data.self).toBe("[Circular]");
  });

  it("undefined → supprimé", async () => {
    const res = jsonOk({ name: "Jean", secret: undefined });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.data).toEqual({ name: "Jean" });
    expect("secret" in body.data).toBe(false);
  });

  it("Date → ISO string (natif)", async () => {
    const d = new Date("2024-01-01T00:00:00.000Z");
    const res = jsonOk({ created: d });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.data.created).toBe("2024-01-01T00:00:00.000Z");
  });

  it("symbol → ignoré (comportement natif)", async () => {
    const res = jsonOk({ [Symbol("id")]: 1, name: "Jean" });
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    expect(body.data).toEqual({ name: "Jean" });
  });
});
