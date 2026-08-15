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

describe("DEBUG7", () => {
  it("check tables", async () => {
    // Check if tables exist
    const res = await fetch(`${baseUrl}/api/admin/services`);
    console.log("Services (no auth):", res.status);
    
    // Try with auth
    const res2 = await fetch(`${baseUrl}/api/admin/services`, {
      headers: { "Cookie": cookieHeader() },
    });
    console.log("Services (auth):", res2.status);
    console.log("Services body:", await res2.text());
  });

  it("company PUT with error details", async () => {
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
  });
});
