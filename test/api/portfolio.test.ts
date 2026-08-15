import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";
let cookies: Record<string, string> = {};
let adminUserId = "";

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

function cookieHeader(): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

beforeAll(async () => {
  const server = await getTestServer();
  baseUrl = server.baseUrl;

  // Login admin
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  expect(res.status).toBe(200);
  cookies = parseCookies(res.headers.get("set-cookie") ?? "");
  
  // Get admin user ID and invalidate RBAC cache
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { "Cookie": cookieHeader() },
  });
  const meData = await meRes.json() as { success: boolean; data: { id: string } };
  if (meData.success) {
    adminUserId = meData.data.id;
    // Invalidate RBAC cache to pick up new permissions
    server.ctx.rbac.invalidate(adminUserId);
  }
});

afterAll(async () => {
  await releaseTestServer();
});

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
      const data = await res.json() as { success: boolean; data: unknown; pagination: unknown };
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.pagination).toBeDefined();
    });

    it("POST /api/admin/categories crée une catégorie", async () => {
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Résidentiel", slug: "residentiel", description: "Test", sortOrder: 0 }),
      });
      expect(res.status).toBe(201);
      const data = await res.json() as { success: boolean; message: string };
      expect(data.success).toBe(true);
    });

    it("POST /api/admin/categories avec slug dupliqué → 409", async () => {
      await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Résidentiel Dup", slug: "residentiel" }),
      });
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Résidentiel Dup2", slug: "residentiel" }),
      });
      expect(res.status).toBe(409);
    });

    it("POST /api/admin/categories avec slug invalide → 400", async () => {
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Test", slug: "Invalid Slug!" }),
      });
      expect(res.status).toBe(400);
    });

    it("PUT /api/admin/categories/:id modifie une catégorie", async () => {
      const listRes = await fetch(`${baseUrl}/api/admin/categories`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as { data: Array<{ id: string; slug: string }> };
      const cat = listData.data.find(c => c.slug === "residentiel");
      if (!cat) return;

      const res = await fetch(`${baseUrl}/api/admin/categories/${cat.id}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Résidentiel Modifié" }),
      });
      expect(res.status).toBe(200);
    });

    it("DELETE /api/admin/categories/:id supprime une catégorie", async () => {
      const listRes = await fetch(`${baseUrl}/api/admin/categories`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as { data: Array<{ id: string; slug: string }> };
      const cat = listData.data.find(c => c.slug === "residentiel");
      if (!cat) return;

      const res = await fetch(`${baseUrl}/api/admin/categories/${cat.id}`, {
        method: "DELETE",
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Projets", () => {
    it("GET /api/admin/projects sans session → 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects`);
      expect(res.status).toBe(401);
    });

    it("POST /api/admin/projects crée un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Ma Réalisation", slug: "ma-realisation", status: "draft" }),
      });
      expect(res.status).toBe(201);
      const data = await res.json() as { success: boolean; id?: string };
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
    });

    it("POST /api/admin/projects avec slug dupliqué → 409", async () => {
      await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Dup 1", slug: "ma-realisation-dup" }),
      });
      const res = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Dup 2", slug: "ma-realisation-dup" }),
      });
      expect(res.status).toBe(409);
    });

    it("GET /api/admin/projects/:id récupère un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
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
      const data = await res.json() as { success: boolean; data: { title: string } };
      expect(data.success).toBe(true);
      expect(data.data.title).toBe("Test Get");
    });

    it("PUT /api/admin/projects/:id modifie un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
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
          "X-CSRF-Token": cookies.csrf_token ?? "",
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
          "X-CSRF-Token": cookies.csrf_token ?? "",
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
          "X-CSRF-Token": cookies.csrf_token ?? "",
        },
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/projects/:id/unpublish dépublie un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
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
          "X-CSRF-Token": cookies.csrf_token ?? "",
        },
      });
      expect(res.status).toBe(200);
    });

    it("DELETE /api/admin/projects/:id soft delete un projet", async () => {
      const createRes = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
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
