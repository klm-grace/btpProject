import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let baseUrl = "";
let cookies: Record<string, string> = {};

function parseCookies(setCookieHeader: string): Record<string, string> {
  const c: Record<string, string> = {};
  for (const part of setCookieHeader.split(", ")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const name = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).split(";")[0]?.trim() ?? "";
      c[name] = value;
    }
  }
  return c;
}

/** Crée un FormData avec un fichier image PNG valide. */
function makeUploadForm(buffer: Uint8Array, filename: string = "test.png"): FormData {
  const blob = new Blob([buffer], { type: "image/png" });
  const form = new FormData();
  form.append("file", blob, filename);
  return form;
}

function cookieHeader(): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

beforeAll(async () => {
  const server = await getTestServer();
  baseUrl = server.baseUrl;

  // Login
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  expect(res.status).toBe(200);
  cookies = parseCookies(res.headers.get("set-cookie") ?? "");
});

afterAll(async () => {
  await releaseTestServer();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("section 09 — Upload média", () => {
  it("POST /api/media sans session → 403 (CSRF check)", async () => {
    // Lire une image PNG valide
    const buf = readFileSync(join(import.meta.dir, "../fixtures/sample.png"));
    const res = await fetch(`${baseUrl}/api/media`, {
      method: "POST",
      headers: { "X-CSRF-Token": "fake" },
      body: makeUploadForm(new Uint8Array(buf)),
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/media avec session + PNG valide → 200", async () => {
    const buf = readFileSync(join(import.meta.dir, "../fixtures/sample.png"));
    const res = await fetch(`${baseUrl}/api/media`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies.csrf_token ?? "",
      },
      body: makeUploadForm(new Uint8Array(buf)),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; data: { key: string; mime: string; size: number } };
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.key).toBeDefined();
    expect(typeof data.data.key).toBe("string");
    expect(data.data.mime).toBe("image/png");
    expect(data.data.size).toBeGreaterThan(0);
  });

  it("POST /api/media avec fichier vide → 400", async () => {
    const form = new FormData();
    form.append("file", new Blob([], { type: "image/png" }), "empty.png");

    const res = await fetch(`${baseUrl}/api/media`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies.csrf_token ?? "",
      },
      body: form,
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { success: boolean; error: { code: string } };
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("EMPTY_FILE");
  });

  it("POST /api/media sans fichier → 400", async () => {
    const form = new FormData();
    form.append("other", "data");

    const res = await fetch(`${baseUrl}/api/media`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies.csrf_token ?? "",
      },
      body: form,
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { success: boolean; error: { code: string } };
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("MISSING_FILE");
  });

  it("POST /api/media avec garbage (pas d'image) → 400", async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
    const blob = new Blob([garbage], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, "fake.png");

    const res = await fetch(`${baseUrl}/api/media`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies.csrf_token ?? "",
      },
      body: form,
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { success: boolean; error: { code: string } };
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("INVALID_MAGIC");
  });

  it("POST /api/media stocke le fichier sur le disque", async () => {
    const buf = readFileSync(join(import.meta.dir, "../fixtures/sample.png"));
    const res = await fetch(`${baseUrl}/api/media`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies.csrf_token ?? "",
      },
      body: makeUploadForm(new Uint8Array(buf)),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: { key: string } };
    const key = data.data.key;
    // Clé avec arborescence YYYY/MM/DD/
    expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\//);
  });
});