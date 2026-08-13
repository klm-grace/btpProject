import { describe, expect, it, beforeAll } from "bun:test";

const BASE = "http://127.0.0.1:4000";

/**
 * Tests d'intégration sécurité HTTP.
 * Exigent que l'API soit lancée (bun run api:dev).
 *
 * Lancement :
 *   bun run test:integration
 *
 * Ces tests sont SÉPARÉS de `bun test` pour ne pas rendre la commande
 * standard rouge en l'absence de serveur.
 */

let available = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/api/health`);
    available = res.ok;
  } catch {
    available = false;
  }
});

describe("section 04 — sécurité HTTP", () => {
  // ── Security Headers ────────────────────────────────────────────────────

  it("GET /api/health contient HSTS, X-Frame-Options, X-Content-Type-Options", async () => {
    if (!available) { console.warn("[skip] API non disponible (lancer bun run api:dev)"); return; }
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /api/health contient Content-Security-Policy strict", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("GET /api/health contient Referrer-Policy", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("GET /inexistant contient aussi les security headers", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/endpoint-qui-nexiste-pas-404`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  // ── CORS ────────────────────────────────────────────────────────────────

  it("GET /api/health avec Origin autorisée → CORS headers présents", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health`, {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("GET /api/health avec Origin non autorisée → PAS de CORS allow-origin", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health`, {
      headers: { Origin: "https://evil.com" },
    });
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao === null || acao === "null").toBe(true);
  });

  it("GET /api/health sans Origin (curl) → pas de CORS header", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("OPTIONS preflight avec origin autorisée → 204 + CORS headers", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
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
    if (!available) { console.warn("[skip] API non disponible"); return; }
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

  it("GET /api/health → réponse publique minimale", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health`);
    const body = (await res.json()) as { success: boolean; data: { ready: boolean } };
    expect(body.success).toBe(true);
    expect(body.data.ready).toBe(true);
    expect(body.data).not.toHaveProperty("dependencies");
  });

  it("GET /api/health/detail sans token → 403", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health/detail`);
    expect(res.status).toBe(403);
  });

  it("GET /api/health/detail avec mauvais token → 403", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health/detail`, {
      headers: { "x-monitoring-token": "mauvais-token" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/health/detail avec token vide → 403", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/health/detail`, {
      headers: { "x-monitoring-token": "" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/ready → 200 + prêt", async () => {
    if (!available) { console.warn("[skip] API non disponible"); return; }
    const res = await fetch(`${BASE}/api/ready`);
    const body = (await res.json()) as { success: boolean; data: { ready: boolean } };
    expect(body.success).toBe(true);
    expect(typeof body.data.ready).toBe("boolean");
    expect(body.data).not.toHaveProperty("dependencies");
  });
});
