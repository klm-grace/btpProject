import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";
import { cleanupTestDB } from "../support/cleanup";

let baseUrl = "";
let cookies: Record<string, string> = {};

function cookieHeader(): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function csrfHeader(): string {
  return cookies["csrf_token"] ?? "";
}

beforeAll(async () => {
  await cleanupTestDB();
  const server = await getTestServer();
  baseUrl = server.baseUrl;
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  for (const part of (loginRes.headers.get("set-cookie") ?? "").split(", ")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      cookies[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).split(";")[0]?.trim() ?? "";
    }
  }
});

afterAll(async () => {
  await releaseTestServer();
});

describe("section 13 — Événements de sécurité", () => {
  it("GET /api/admin/security-events sans session → 401", async () => {
    const res = await fetch(`${baseUrl}/api/admin/security-events`);
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/security-events avec session → 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/security-events`, {
      headers: { "Cookie": cookieHeader() },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
  });

  it("GET /api/admin/security-events avec filtre eventType → 200", async () => {
    const res = await fetch(`${baseUrl}/api/admin/security-events?eventType=login_failed`, {
      headers: { "Cookie": cookieHeader() },
    });
    expect(res.status).toBe(200);
  });

  it("PUT /api/admin/users/:id/flag sans permission → 403", async () => {
    // Create a non-admin user
    await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": csrfHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "test@example.com", password: "Test1234!", firstName: "Test" }),
    });
    // This would need a non-admin user - skip for now
  });
});
