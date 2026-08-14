import type { SecurityHeadersConfig } from "./types.ts";

/** Defaults conformes au plan : CSP strict (API JSON), HSTS 1 an, pas de frame. */
const DEFAULTS: Required<SecurityHeadersConfig> = {
  csp: "default-src 'none'",
  hstsMaxAge: 31_536_000, // 1 an
  frameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "",
  contentTypeOptions: "nosniff",
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
};

/**
 * Crée un objet de headers de sécurité HTTP.
 *
 * Usage dans l'app (pas dans une bibliothèque) :
 * ```ts
 * const sec = createSecurityHeaders({ csp: "..." });
 * const headers = sec.buildHeaders();
 * ```
 *
 * Aucun process.env, aucun port, extraction possible.
 */
export function createSecurityHeaders(config: SecurityHeadersConfig = {}) {
  const cfg = { ...DEFAULTS, ...config };

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Strict-Transport-Security": `max-age=${cfg.hstsMaxAge}; includeSubDomains`,
      "X-Content-Type-Options": cfg.contentTypeOptions,
      "X-Frame-Options": cfg.frameOptions,
      "Referrer-Policy": cfg.referrerPolicy,
      "Cross-Origin-Opener-Policy": cfg.crossOriginOpenerPolicy,
      "Cross-Origin-Resource-Policy": cfg.crossOriginResourcePolicy,
    };

    if (cfg.csp) {
      headers["Content-Security-Policy"] = cfg.csp;
    }
    if (cfg.permissionsPolicy) {
      headers["Permissions-Policy"] = cfg.permissionsPolicy;
    }

    return headers;
  }

  /**
   * Applique les headers de sécurité sur une Response existante (clone immuable).
   */
  function applyHeaders(res: Response): Response {
    const patched = new Response(res.body, res);
    const h = buildHeaders();
    for (const [key, value] of Object.entries(h)) {
      patched.headers.set(key, value);
    }
    return patched;
  }

  return { buildHeaders, applyHeaders };
}
