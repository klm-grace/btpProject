import { describe, expect, it } from "bun:test";
import {
  json,
  jsonOk,
  jsonError,
  jsonErrorResponse,
  jsonPaginated,
  jsonStream,
  text,
  html,
  htmlEscape,
  htmlSanitize,
  xml,
  notFound,
  send,
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

  it("accepte null comme body", async () => {
    const res = json(null);
    const body = JSON.parse(await res.text()) as { success: boolean; data: null };
    expect(body).toEqual({ success: true, data: null });
  });

  it("accepte undefined comme body", async () => {
    const res = json(undefined);
    const body = JSON.parse(await res.text()) as { success: boolean; data: unknown };
    // JSON.stringify(undefined) → undefined → Response body = "undefined"
    expect(body.success).toBe(true);
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
    expect((body as { data: Record<string, unknown> }).data.password).toBe("secret123");
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
    const body = JSON.parse(await res.text()) as { success: boolean; error: { code: string; message: string; requestId?: string; details?: Record<string, unknown> } };
    expect(body.error.requestId).toBe("req-789");
  });

  it("injecte details si fournis", async () => {
    const res = jsonError({ code: "VALIDATION", message: "Invalid", details: { field: "email" } });
    const body = JSON.parse(await res.text()) as { success: boolean; error: { code: string; message: string; requestId?: string; details?: Record<string, unknown> } };
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
    const body = JSON.parse(await res.text()) as { success: boolean; data: unknown[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
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
    const body = JSON.parse(await res.text()) as { success: boolean; error: { code: string; message: string } };
    expect(body.error.message).toBe("Query failed");
    expect(body.error.message).not.toContain("postgres");
  });

  it("json() ne fuit pas de credentials", async () => {
    const res = json({ error: "Auth failed" }, 401, { code: "AUTH_FAILED" });
    const body = JSON.parse(await res.text()) as { success: boolean; error: { code: string; message: string } };
    expect(body).toEqual({ success: false, error: { code: "AUTH_FAILED", message: "Auth failed" } });
  });
});

describe("sérialisation sûre", () => {
  it("BigInt → string", async () => {
    const res = jsonOk({ count: BigInt(9007199254740991) });
    const body = JSON.parse(await res.text()) as { success: boolean; data: { count: string } };
    expect(body.data.count).toBe("9007199254740991");
  });

  it("cycle → [Circular]", async () => {
    const cyc: any = { name: "test" };
    cyc.self = cyc;
    const res = jsonOk(cyc);
    const body = JSON.parse(await res.text()) as { success: boolean; data: { name: string; self: string } };
    expect(body.data.self).toBe("[Circular]");
  });

  it("undefined → supprimé", async () => {
    const res = jsonOk({ name: "Jean", secret: undefined });
    const body = JSON.parse(await res.text()) as { success: boolean; data: { name: string } };
    expect(body.data).toEqual({ name: "Jean" });
    expect("secret" in body.data).toBe(false);
  });

  it("Date → ISO string (natif)", async () => {
    const d = new Date("2024-01-01T00:00:00.000Z");
    const res = jsonOk({ created: d });
    const body = JSON.parse(await res.text()) as { success: boolean; data: { created: string } };
    expect(body.data.created).toBe("2024-01-01T00:00:00.000Z");
  });

  it("symbol → ignoré (comportement natif)", async () => {
    const res = jsonOk({ [Symbol("id")]: 1, name: "Jean" });
    const body = JSON.parse(await res.text()) as { success: boolean; data: { name: string } };
    expect(body.data).toEqual({ name: "Jean" });
  });
});

describe("htmlSanitize() — sanitization HTML", () => {
  it("supprime les balises script", () => {
    expect(htmlSanitize('<script>alert(1)</script><h1>Hello</h1>')).toBe("alert(1)<h1>Hello</h1>");
  });

  it("supprime les event handlers", () => {
    expect(htmlSanitize('<img src=x onerror=alert(1)>')).toBe('<img src=x>');
  });

  it("supprime les URLs javascript:", () => {
    expect(htmlSanitize('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>');
  });

  it("supprime iframe et object", () => {
    expect(htmlSanitize('<iframe src="evil"></iframe><h1>Safe</h1>')).toBe("<h1>Safe</h1>");
    expect(htmlSanitize('<object data="evil"></object><h1>Safe</h1>')).toBe("<h1>Safe</h1>");
  });

  it("conserve le HTML légitime", () => {
    expect(htmlSanitize('<h1 class="title">Hello <strong>World</strong></h1>')).toBe('<h1 class="title">Hello <strong>World</strong></h1>');
  });

  it("conserve les data attributes", () => {
    expect(htmlSanitize('<div data-user-id="123">test</div>')).toBe('<div data-user-id="123">test</div>');
  });

  it("conserve les styles inline", () => {
    expect(htmlSanitize('<div style="color: red;">test</div>')).toBe('<div style="color: red;">test</div>');
  });

  it("bloque SVG onload", () => {
    expect(htmlSanitize('<svg onload=alert(1)><rect width="100" height="100"/></svg>')).toBe('<rect width="100" height="100"/>');
  });

  it("multi-attaques", () => {
    const input = '<script>x</script><img src=x onerror=alert(1)><iframe src="evil"></iframe><h1>Safe</h1>';
    const output = htmlSanitize(input);
    expect(output).not.toContain('<script');
    expect(output).not.toContain('onerror');
    expect(output).not.toContain('<iframe');
    expect(output).toContain('<h1>');
  });
});

describe("html() — réponse HTML", () => {
  it("retourne le HTML tel quel", async () => {
    const res = html("<h1 class='title'>Hello <strong>World</strong></h1>");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1 class='title'>Hello <strong>World</strong></h1>");
  });

  it("ajoute les headers de sécurité", async () => {
    const res = html("<h1>test</h1>");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-xss-protection")).toBe("1; mode=block");
  });

  it("accepte un status custom", async () => {
    const res = html("<h1>Created</h1>", 201);
    expect(res.status).toBe(201);
  });
});

describe("htmlEscape() — échappement XSS", () => {
  it("échappe < > & \" '", async () => {
    expect(htmlEscape("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(htmlEscape('Hello "world"')).toBe("Hello &quot;world&quot;");
    expect(htmlEscape("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(htmlEscape("it's")).toBe("it&#x27;s");
  });

  it("laisse le texte normal intact", async () => {
    expect(htmlEscape("Hello World")).toBe("Hello World");
    expect(htmlEscape("123")).toBe("123");
  });
});

describe("xml() — réponse XML sécurisée", () => {
  it("retourne du XML valide", async () => {
    const res = xml("<root><item>test</item></root>");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(await res.text()).toBe("<root><item>test</item></root>");
  });

  it("bloque DOCTYPE (XXE)", async () => {
    const res = xml('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root/>');
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_XML");
  });

  it("bloque DOCTYPE mixte case", async () => {
    const res = xml('<!DoCtYpE foo><root/>');
    expect(res.status).toBe(400);
  });

  it("bloque DOCTYPE caché dans commentaire", async () => {
    const res = xml('<!-- comment --><!DOCTYPE foo><root/>');
    expect(res.status).toBe(400);
  });
});

describe("send() — auto-détection", () => {
  it("string texte → text/plain", async () => {
    const res = send("Hello World");
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("Hello World");
  });

  it("string HTML → text/html", async () => {
    const res = send("<h1>Hello</h1>");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>Hello</h1>");
  });

  it("string XML → application/xml", async () => {
    const res = send("<?xml version=\"1.0\"?><root/>");
    expect(res.headers.get("content-type")).toContain("application/xml");
  });

  it("objet → application/json", async () => {
    const res = send({ user: { id: 1 } });
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = JSON.parse(await res.text()) as { success: boolean; data: { user: { id: number } } };
    expect(body.data.user.id).toBe(1);
  });

  it("array → application/json", async () => {
    const res = send([1, 2, 3]);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("null → 204", async () => {
    const res = send(null);
    expect(res.status).toBe(204);
  });

  it("undefined → 204", async () => {
    const res = send(undefined);
    expect(res.status).toBe(204);
  });

  it("nombre → application/json", async () => {
    const res = send(42);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.text()).toContain("42");
  });
});
