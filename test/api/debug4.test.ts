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

describe("DEBUG4", () => {
  it("company PUT detailed", async () => {
    const res = await fetch(`${baseUrl}/api/admin/company`, {
      method: "PUT",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Co " + Date.now() }),
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  });

  it("services POST detailed", async () => {
    const res = await fetch(`${baseUrl}/api/admin/services`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Svc " + Date.now(), slug: "test-svc-" + Date.now() }),
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  });

  it("team POST detailed", async () => {
    const res = await fetch(`${baseUrl}/api/admin/team`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ firstName: "John", lastName: "Doe " + Date.now(), sortOrder: 0 }),
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  });

  it("content-sections POST detailed", async () => {
    const res = await fetch(`${baseUrl}/api/admin/content-sections`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug: "test-section-" + Date.now(), title: "Test" }),
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  });

  it("seo-metas POST detailed", async () => {
    const res = await fetch(`${baseUrl}/api/admin/seo-metas`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entityType: "service", entityId: "00000000-0000-0000-0000-000000000001", title: "Test" }),
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  });

  it("settings PUT detailed", async () => {
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
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  });
});
