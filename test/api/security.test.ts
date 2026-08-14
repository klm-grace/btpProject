import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { startTestApiServer } from "../integration-api";

let baseUrl: string;
let stopServer: () => Promise<void>;
let cookies: Record<string, string> = {};

function parseCookies(setCookieHeader: string): Record<string, string> {
  const c: Record<string, string> = {};
  for (const part of setCookieHeader.split(",")) {
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

function cookieStr(c: Record<string, string>): string {
  return Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; ");
}

beforeAll(async () => {
  const api = await startTestApiServer();
  baseUrl = api.baseUrl;
  stopServer = api.stop;

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  expect(res.status).toBe(200);
  cookies = parseCookies(res.headers.get("set-cookie") ?? "");
});

afterAll(async () => {
  await stopServer();
});

describe("section 04 — sécurité HTTP", () => {
  it("GET /api/health contient HSTS, X-Frame-Options, X-Content-Type-Options", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-monitoring-token": "test-monitoring-token" },
    });
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /api/health contient Content-Security-Policy strict", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-monitoring-token": "test-monitoring-token" },
    });
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("GET /api/health contient Referrer-Policy", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-monitoring-token": "test-monitoring-token" },
    });
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("GET /inexistant contient aussi les security headers", async () => {
    const res = await fetch(`${baseUrl}/api/endpoint-qui-nexiste-pas-404`, {
      headers: { "x-monitoring-token": "test-monitoring-token" },
    });
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /api/health sans token = 403", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(403);
  });

  it("GET /api/health avec token valide = 200", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { "x-monitoring-token": "test-monitoring-token" } });
    expect(res.status).toBe(200);
  });

  it("GET /api/health avec token invalide = 403", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { "x-monitoring-token": "wrong" } });
    expect(res.status).toBe(403);
  });

  it("Toute réponse contient x-request-id", async () => {
    const res = await fetch(`${baseUrl}/api/ready`, { headers: { "x-monitoring-token": "test-monitoring-token" } });
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("section 05 — authentification", () => {
  it("POST /api/auth/login valide → 200 + cookies", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { user: { id: string; email: string; roles: string[] } } };
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe("admin@btp-dev.local");
    expect(Array.isArray(body.data.user.roles)).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sid=");
    expect(setCookie).toContain("csrf_token=");
  });

  it("POST /api/auth/login mauvais password → 401 générique", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "wrong123" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_FAILED");
    expect(body.error.message).not.toContain("admin@btp-dev.local");
  });

  it("POST /api/auth/login email inexistant → 401 (pas d'énumération)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@example.com", password: "x1!" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login body invalide → 400", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-email", password: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("cookies Set-Cookie : sid=HttpOnly, csrf_token=lisible, Secure, SameSite=Strict", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const parts = setCookie.split(", ");
    const sessionPart = parts.find((p) => p.startsWith("sid="));
    const csrfPart = parts.find((p) => p.startsWith("csrf_token="));
    expect(sessionPart).toBeTruthy();
    expect(csrfPart).toBeTruthy();
    expect(sessionPart).toContain("HttpOnly");
    expect(sessionPart).toContain("Secure");
    expect(sessionPart).toContain("SameSite=Strict");
    expect(csrfPart).toContain("Secure");
    expect(csrfPart).toContain("SameSite=Strict");
    expect(csrfPart).not.toContain("HttpOnly");
  });

  it("GET /api/auth/me avec session valide → 200 + user", async () => {
    // Faire un login frais dans le test même
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");
    const cookieStrVal = Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; ");
    
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieStrVal },
    });
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as { success: boolean; data: { user: { id: string; email: string; roles: string[]; mfaEnabled: boolean } } };
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe("admin@btp-dev.local");
    expect(Array.isArray(body.data.user.roles)).toBe(true);
    expect(typeof body.data.user.mfaEnabled).toBe("boolean");
  });

  it("GET /api/auth/me sans cookie → 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me cookie invalide → 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: "sid=invalid; csrf_token=abc" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/change-password sans session → 403 (CSRF check first)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "x", newPassword: "y" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("csrf_invalid");
  });

  it("GET /api/auth/csrf → 200 + token hex 64 chars", async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { csrfToken: string } };
    expect(body.success).toBe(true);
    expect(body.data.csrfToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("GET /api/auth/csrf token unique à chaque appel", async () => {
    const t1 = ((await (await fetch(`${baseUrl}/api/auth/csrf`)).json()) as { data: { csrfToken: string } }).data.csrfToken;
    const t2 = ((await (await fetch(`${baseUrl}/api/auth/csrf`)).json()) as { data: { csrfToken: string } }).data.csrfToken;
    expect(t1).not.toBe(t2);
  });

  it("POST /api/auth/logout → 200, session révoquée → /me 401", async () => {
    // Login frais
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");

    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    expect(meRes.status).toBe(401);
  });
});

describe("section 06 — autorisations (RBAC sur routes)", () => {
  it("GET /api/auth/me sans session → 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });
});

describe("section 07 — CSRF protection sur mutations", () => {
  it("POST /api/auth/login exempté du CSRF → 200 sans token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/auth/logout exempté du CSRF → 200", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");

    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/auth/change-password sans header CSRF → 403", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");

    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: JSON.stringify({ currentPassword: "admin1234", newPassword: "Another1!" }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/auth/change-password token CSRF invalide → 403", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");

    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; "),
        "X-CSRF-Token": "invalid-token",
      },
      body: JSON.stringify({ currentPassword: "admin1234", newPassword: "Another1!" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("csrf_invalid");
  });

  it("GET /api/auth/me exempt du CSRF (GET non protégé) → 200", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: Object.entries(loginCookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    expect(meRes.status).toBe(200);
  });
});
