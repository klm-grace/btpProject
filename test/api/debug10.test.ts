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

describe("DEBUG10", () => {
  it("company PUT", async () => {
    const res = await fetch(`${baseUrl}/api/admin/company`, {
      method: "PUT",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Co " + Date.now() }),
    });
    console.log("Company:", res.status, await res.text());
  });

  it("team POST", async () => {
    const res = await fetch(`${baseUrl}/api/admin/team`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ firstName: "John", lastName: "Doe " + Date.now(), sortOrder: 0 }),
    });
    console.log("Team:", res.status, await res.text());
  });

  it("services POST", async () => {
    const res = await fetch(`${baseUrl}/api/admin/services`, {
      method: "POST",
      headers: {
        "Cookie": cookieHeader(),
        "X-CSRF-Token": cookies["csrf_token"] ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Svc " + Date.now(), slug: "test-svc-debug-" + Date.now() }),
    });
    console.log("Services:", res.status, await res.text());
  });
});
