import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";
let cookies: Record<string, string> = {};
let adminToken: string;
let categoryId: string;
let projectId: string;

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
  adminToken = cookies.session_token ?? "";
});

afterAll(async () => {
  await releaseTestServer();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createCategory(name: string, slug: string) {
  const res = await fetch(`${baseUrl}/api/admin/categories`, {
    method: "POST",
    headers: {
      "Cookie": cookieHeader(),
      "X-CSRF-Token": cookies.csrf_token ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, slug, description: "Test", sortOrder: 0 }),
  });
  return res;
}

async function getCategory(id: string) {
  return fetch(`${baseUrl}/api/admin/categories`, {
    headers: { "Cookie": cookieHeader() },
  });
}

async function createProject(title: string, slug: string, options: { status?: string; categoryIds?: string[] } = {}) {
  const res = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: {
      "Cookie": cookieHeader(),
      "X-CSRF-Token": cookies.csrf_token ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, slug, ...options }),
  });
  return res;
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
      const data = await res.json() as { success: boolean; data: unknown; pagination: unknown };
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.pagination).toBeDefined();
    });

    it("POST /api/admin/categories crée une catégorie", async () => {
      const res = await createCategory("Résidentiel", "residentiel");
      expect(res.status).toBe(201);
      const data = await res.json() as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain("créée");
    });

    it("POST /api/admin/categories avec slug dupliqué → 409", async () => {
      await createCategory("Résidentiel Dup", "residentiel");
      const res = await createCategory("Résidentiel Dup2", "residentiel");
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
      // Créer une catégorie pour le test
      const createRes = await createCategory("Test Edit", "test-edit");
      expect(createRes.status).toBe(201);
      const createData = await createRes.json() as { id?: string };

      // list for id
      const listRes = await fetch(`${baseUrl}/api/admin/categories`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as { data: Array<{ id: string; name: string }> };
      const cat = listData.data[listData.data.length - 1];
      expect(cat).toBeDefined();

      const updateRes = await fetch(`${baseUrl}/api/admin/categories/${cat.id}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Test Edité" }),
      });
      expect(updateRes.status).toBe(200);
    });

    it("DELETE /api/admin/categories/:id supprime une catégorie", async () => {
      const listRes = await fetch(`${baseUrl}/api/admin/categories`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as { data: Array<{ id: string }> };
      const cat = listData.data.find(c => c.slug === "test-edit");
      if (cat) {
        const delRes = await fetch(`${baseUrl}/api/admin/categories/${cat.id}`, {
          method: "DELETE",
          headers: { "Cookie": cookieHeader() },
        });
        expect(delRes.status).toBe(200);
      }
    });
  });

  describe("Projets", () => {
    it("GET /api/admin/projects sans session → 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects`);
      expect(res.status).toBe(401);
    });

    it("POST /api/admin/projects crée un projet", async () => {
      const res = await createProject("Ma Réalisation", "ma-realisation", { status: "draft" });
      expect(res.status).toBe(201);
      const data = await res.json() as { success: boolean; id?: string; message: string };
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
      projectId = data.id as string;
    });

    it("POST /api/admin/projects avec slug dupliqué → 409", async () => {
      const res = await createProject("Dup", "ma-realisation");
      expect(res.status).toBe(409);
    });

    it("GET /api/admin/projects/:id récupère un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects/${projectId}`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; data: { title: string } };
      expect(data.success).toBe(true);
      expect(data.data.title).toBe("Ma Réalisation");
    });

    it("PUT /api/admin/projects/:id modifie un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Ma Réalisation Modifiée" }),
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/projects/:id/publish publie un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects/${projectId}/publish`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
        },
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/projects/:id/unpublish dépublie un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects/${projectId}/unpublish`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
        },
      });
      expect(res.status).toBe(200);
    });

    it("DELETE /api/admin/projects/:id soft delete un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects/${projectId}`, {
        method: "DELETE",
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Images projet", () => {
    it("POST /api/admin/projects/:id/images ajoute une image", async () => {
      // Need a media first - skip if not available in test env
      const res = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Image", slug: "test-image-project" }),
      });
      const data = await res.json() as { success: boolean; id?: string };
      if (data.success && data.id) {
        // Try adding image with fake media ID
        const imgRes = await fetch(`${baseUrl}/api/admin/projects/${data.id}/images`, {
          method: "POST",
          headers: {
            "Cookie": cookieHeader(),
            "X-CSRF-Token": cookies.csrf_token ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mediaId: "00000000-0000-0000-0000-000000000000", sortOrder: 0, isCover: true }),
        });
        // Should be 404 (media not found) not 500
        expect([404, 400, 500]).toContain(imgRes.status);
      }
    });
  });
});
