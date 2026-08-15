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
  
  // Get user ID
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { "Cookie": cookieHeader() },
  });
  const meData = await meRes.json() as { success: boolean; data: { user: { id: string; email: string; roles: string[] } } };
  if (meData.success) {
    adminUserId = meData.data.user.id;
    // Debug: check permissions
    const perms = await server.ctx.rbac.getUserPermissions(adminUserId);
    console.log("DEBUG - User ID:", adminUserId);
    console.log("DEBUG - Permissions:", perms);
    console.log("DEBUG - Has portfolio.read:", perms.includes("portfolio.read"));
    console.log("DEBUG - Has portfolio.write:", perms.includes("portfolio.write"));
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
      console.log("DEBUG - GET categories status:", res.status);
      console.log("DEBUG - GET categories body:", await res.text());
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/categories crée une catégorie", async () => {
      const res = await fetch(`${baseUrl}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Résidentiel", slug: "residentiel-" + Date.now(), description: "Test", sortOrder: 0 }),
      });
      console.log("DEBUG - POST categories status:", res.status);
      console.log("DEBUG - POST categories body:", await res.text());
      expect(res.status).toBe(201);
    });
  });

  describe("Projets", () => {
    it("POST /api/admin/projects crée un projet", async () => {
      const res = await fetch(`${baseUrl}/api/admin/projects`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies.csrf_token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Ma Réalisation", slug: "ma-realisation-" + Date.now(), status: "draft" }),
      });
      console.log("DEBUG - POST projects status:", res.status);
      console.log("DEBUG - POST projects body:", await res.text());
      expect(res.status).toBe(201);
    });
  });
});
