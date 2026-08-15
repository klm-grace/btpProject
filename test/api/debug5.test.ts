import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";
let cookies: Record<string, string> = {};

function cookieHeader(): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

beforeAll(async () => {
  const server = await getTestServer();
  baseUrl = server.baseUrl;
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  expect(loginRes.status).toBe(200);
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

describe("DEBUG5 - Handler errors", () => {
  it("company PUT with verbose error", async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/company`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies["csrf_token"] ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Test Co " + Date.now() }),
      });
      console.log("Company PUT:", res.status, await res.text());
    } catch (e) {
      console.log("Company PUT error:", e);
    }
  });

  it("team POST with verbose error", async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/team`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies["csrf_token"] ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ firstName: "John", lastName: "Doe " + Date.now(), sortOrder: 0 }),
      });
      console.log("Team POST:", res.status, await res.text());
    } catch (e) {
      console.log("Team POST error:", e);
    }
  });

  it("seo-metas POST with verbose error", async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/seo-metas`, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies["csrf_token"] ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entityType: "service", entityId: "00000000-0000-0000-0000-000000000001", title: "Test" }),
      });
      console.log("SEO POST:", res.status, await res.text());
    } catch (e) {
      console.log("SEO POST error:", e);
    }
  });

  it("settings PUT with verbose error", async () => {
    try {
      const key = "test_key_" + Date.now();
      const res = await fetch(`${baseUrl}/api/admin/settings/${key}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": cookies["csrf_token"] ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, value: "test_value" }),
      });
      console.log("Settings PUT:", res.status, await res.text());
    } catch (e) {
      console.log("Settings PUT error:", e);
    }
  });
});
