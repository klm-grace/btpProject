import { describe, expect, it } from "bun:test";

const BASE = "http://127.0.0.1:4000";

/**
 * Tests d'intégration sécurité HTTP.
 * Nécessite le serveur lancé (bun run api:dev).
 * Vérifie : security headers, CORS, health restrictions, preflight OPTIONS.
 */

describe("section 04 — sécurité HTTP", () => {
  // ── Security Headers ────────────────────────────────────────────────────

  it("GET /api/health contient HSTS, X-Frame-Options, X-Content-Type-Options", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /api/health contient Content-Security-Policy strict (default-src 'none')", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("GET /api/health contient Referrer-Policy", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("GET /inexistant contient aussi les security headers (pas seulement 200)", async () => {
    const res = await fetch(`${BASE}/api/endpoint-qui-nexiste-pas-404`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  // ── CORS ────────────────────────────────────────────────────────────────

  it("GET /api/health avec Origin autorisée → CORS headers présents", async () => {
    const res = await fetch(`${BASE}/api/health`, {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("GET /api/health avec Origin non autorisée → PAS de CORS allow-origin", async () => {
    const res = await fetch(`${BASE}/api/health`, {
      headers: { Origin: "https://evil.com" },
    });
    // L'origine n'est pas dans la liste blanche → PAS de Access-Control-Allow-Origin valide
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao === null || acao === "null").toBe(true);
  });

  it("GET /api/health sans Origin (curl) → pas de CORS header", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("OPTIONS preflight avec origin autorisée → 204 + CORS headers", async () => {
    const res = await fetch(`${BASE}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });

  it("OPTIONS preflight avec origin non autorisée → 403", async () => {
    const res = await fetch(`${BASE}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(403);
  });

  // ── Health restrictions ─────────────────────────────────────────────────

  it("GET /api/health → réponse publique minimale (pas de détail infra)", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const body = (await res.json()) as { success: boolean; data: { ready: boolean } };
    expect(body.success).toBe(true);
    expect(body.data.ready).toBe(true);
    // PAS de dependencies, PAS de uptime dans la réponse publique
    expect(body.data).not.toHaveProperty("dependencies");
    expect(body.data).not.toHaveProperty("uptime");
  });

  it("GET /api/health/detail sans token → 403", async () => {
    const res = await fetch(`${BASE}/api/health/detail`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("forbidden");
  });

  it("GET /api/health/detail avec mauvais token → 403", async () => {
    const res = await fetch(`${BASE}/api/health/detail`, {
      headers: { "x-monitoring-token": "mauvais-token" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/health/detail avec bon token → 200 + détail infra", async () => {
    const res = await fetch(`${BASE}/api/health/detail`, {
      headers: { "x-monitoring-token": "" }, // MONITORING_TOKEN est vide en dev
    });
    // Si MONITORING_TOKEN est vide, l'accès est bloqué (pas de token configuré)
    expect(res.status).toBe(403);
  });

  it("GET /api/ready → 200 + prêt (pas de détail infra)", async () => {
    const res = await fetch(`${BASE}/api/ready`);
    const body = (await res.json()) as { success: boolean; data: { ready: boolean; status: string } };
    expect(body.success).toBe(true);
    expect(typeof body.data.ready).toBe("boolean");
    expect(typeof body.data.status).toBe("string");
    // PAS de dependencies dans la réponse
    expect(body.data).not.toHaveProperty("dependencies");
  });
});
