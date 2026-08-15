import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";
import { cleanupTestDB } from "../support/cleanup";

let baseUrl = "";
let cookies: Record<string, string> = {};
beforeAll(async () => {
  await cleanupTestDB();
  const server = await getTestServer();
  baseUrl = server.baseUrl;
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  for (const part of (res.headers.get("set-cookie") ?? "").split(", ")) {
    const t = part.trim();
    const i = t.indexOf("=");
    if (i > 0) cookies[t.slice(0, i).trim()] = t.slice(i + 1).split(";")[0]?.trim() ?? "";
  }
});
afterAll(async () => { await releaseTestServer(); });
function cookieHdr() { return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "); }

describe("Router — OPTIONS fix", () => {
  it("OPTIONS /api/health → 204", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("OPTIONS /api/admin/settings → 204 avec Allow", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toContain("GET");
  });

  it("OPTIONS route inexistante → 404", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent_xyz_999`, { method: "OPTIONS" });
    expect(res.status).toBe(404);
  });

  it("Double slash → 400", async () => {
    const res = await fetch(`${baseUrl}/api//admin//settings`);
    expect(res.status).toBe(400);
  });

  it("Method not allowed → 405 avec Allow", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, { method: "PATCH" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBeTruthy();
  });

  it("404 renvoie JSON", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent_xyz_123`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")?.includes("json")).toBe(true);
  });
});

describe("RBAC — Corrections", () => {
  it("Sans session → 401", async () => {
    expect((await fetch(`${baseUrl}/api/admin/settings`)).status).toBe(401);
  });

  it("Token invalide → 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: "sid=invalid" } });
    expect(res.status).toBe(401);
  });

  it("CSRF manquante → 403", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings/test_key`, {
      method: "PUT",
      headers: { "Cookie": cookieHdr(), "Content-Type": "application/json" },
      body: JSON.stringify({ value: "test" }),
    });
    expect(res.status).toBe(403);
  });
});
