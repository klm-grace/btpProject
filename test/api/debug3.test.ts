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
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  console.log("Raw Set-Cookie:", setCookie);
  for (const part of setCookie.split(", ")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const name = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).split(";")[0]?.trim() ?? "";
      cookies[name] = value;
    }
  }
  console.log("Cookies:", cookies);
});

afterAll(async () => {
  await releaseTestServer();
});

describe("DEBUG3", () => {
  it("test company PUT with cookie csrf_token", async () => {
    const csrfToken = cookies["csrf_token"] ?? "";
    console.log("Using csrf_token from cookie:", csrfToken.slice(0, 20) + "...");

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
    console.log("Response:", await res.text());
  });

  it("test services POST with cookie csrf_token", async () => {
    const csrfToken = cookies["csrf_token"] ?? "";
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
