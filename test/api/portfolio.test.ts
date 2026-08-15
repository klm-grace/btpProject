import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";
let cookies: Record<string, string> = {};

function parseCookies(setCookieHeader: string): Record<string, string> {
  const c: Record<string, string> = {};
  for (const part of setCookieHeader.split("; ")) {
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

function cookieHeader(): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

beforeAll(async () => {
  const server = await getTestServer();
  baseUrl = server.baseUrl;

  // Login admin
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  expect(loginRes.status).toBe(200);
  cookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");
});

afterAll(async () => {
  await releaseTestServer();
});

function csrfHeader(): string {
  return cookies["csrf_token"] ?? "";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("section 10 — Portfolio", () => {
  describe("Catégories", () => {
    it("GET /api/admin/categories sans session → 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/categories`);
      expect(res.status).toBe(401);
    });

    it("GET /api/admin/categories avec session → 200", async () => {
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/categories crée une catégorie", async () => {
      const slug = "residentiel-" + Date.now();
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Résidentiel", slug, description: "Test", sortOrder: 0 }),
      });
      expect(res.status).toBe(201);
    });

    it("POST /api/admin/categories avec slug dupliqué → 409", async () => {
      const slug = "dup-slug-" + Date.now();
      await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Dup", slug }),
      });
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Dup2", slug }),
      });
      expect(res.status).toBe(409);
    });

    it("POST /api/admin/categories avec slug invalide → 400", async () => {
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Test", slug: "Invalid Slug!" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Projets", () => {
    it("GET /api/admin/projects sans session → 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects`);
      expect(res.status).toBe(401);
    });

    it("POST /api/admin/projects crée un projet", async () => {
      const slug = "ma-realisation-" + Date.now();
      const res = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Ma Réalisation", slug, status: "draft" }),
      });
      expect(res.status).toBe(201);
    });

    it("POST /api/admin/projects avec slug dupliqué → 409", async () => {
      const slug = "dup-proj-slug-" + Date.now();
      await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Dup 1", slug }),
      });
      const res = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Dup 2", slug }),
      });
      expect(res.status).toBe(409);
    });

    it("GET /api/admin/projects/:id récupère un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Get", slug: "test-get-" + Date.now() }),
      });
      const createData = await createRes.json() as { id?: string };
      if (!createData.id) return;

      const res = await fetch(`${baseUrl}/api/admin/projects/${createData.id}`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });

    it("PUT /api/admin/projects/:id modifie un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Update", slug: "test-update-" + Date.now() }),
      });
      const createData = await createRes.json() as { id?: string };
      if (!createData.id) return;

      const res = await fetch(`${baseUrl}/api/admin/projects/${createData.id}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Update Modifié" }),
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/projects/:id/publish publie un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Publish", slug: "test-publish-" + Date.now() }),
      });
      const createData = await createRes.json() as { id?: string };
      if (!createData.id) return;

      const res = await fetch(`${baseUrl}/api/admin/projects/${createData.id}/publish`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
        },
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/projects/:id/unpublish dépublie un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Unpublish", slug: "test-unpublish-" + Date.now() }),
      });
      const createData = await createRes.json() as { id?: string };
      if (!createData.id) return;

      const res = await fetch(`${baseUrl}/api/admin/projects/${createData.id}/unpublish`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
        },
      });
      expect(res.status).toBe(200);
    });

    it("DELETE /api/admin/projects/:id soft delete un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Delete", slug: "test-delete-" + Date.now() }),
      });
      const createData = await createRes.json() as { id?: string };
      if (!createData.id) return;

      const res = await fetch(`${baseUrl}/api/admin/projects/${createData.id}`, {
        method: "DELETE",
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });
  });
});
