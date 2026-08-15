import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";
let cookies: Record<string, string> = {};

function cookieHeader(): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
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

describe("DEBUG2", () => {
  it("test company PUT", async () => {
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: { "Cookie": cookieHeader() },
    });
    const csrfData = await csrfRes.json() as { data?: { csrfToken?: string } };
    const csrfToken = csrfData.data?.csrfToken ?? "";
    console.log("CSRF token:", csrfToken.slice(0, 20) + "...");
    console.log("Cookie header:", cookieHeader().slice(0, 100));

    const res = await fetch(`${baseUrl}/api/admin/company`, {
      method: "PUT",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Company" }),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.slice(0, 300));
  });

  it("test services POST", async () => {
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: { "Cookie": cookieHeader() },
    });
    const csrfData = await csrfRes.json() as { data?: { csrfToken?: string } };
    const csrfToken = csrfData.data?.csrfToken ?? "";

    const res = await fetch(`${baseUrl}/api/admin/services`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Service", slug: "test-svc-" + Date.now() }),
    });
    console.log("Services POST Status:", res.status);
    console.log("Services POST Response:", await res.text());
  });
});
