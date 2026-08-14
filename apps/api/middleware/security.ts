/**
 * Middleware de sécurité HTTP — Headers de protection (OWASP ASVS V7).
 * Équivalent Helmet.js pour Bun.
 */

import type { Middleware } from "../types";

/**
 * Configuration CSP par défaut — restrictive mais fonctionnelle pour API + SPA.
 */
const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Pour styles inline si besoin
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export interface SecurityHeadersConfig {
  /** Content-Security-Policy (défaut: restrictif) */
  csp?: string;
  /** Activer HSTS (défaut: true si HTTPS détecté via x-forwarded-proto) */
  hsts?: boolean;
  /** Durée HSTS en secondes (défaut: 1 an) */
  hstsMaxAge?: number;
  /** Inclure sous-domaines HSTS */
  hstsIncludeSubDomains?: boolean;
  /** Précharge HSTS */
  hstsPreload?: boolean;
  /** X-Frame-Options (défaut: DENY) */
  frameOptions?: "DENY" | "SAMEORIGIN";
  /** Referrer-Policy (défaut: strict-origin-when-cross-origin) */
  referrerPolicy?: string;
  /** Permissions-Policy (défaut: restrictif) */
  permissionsPolicy?: string;
  /** Cross-Origin-Opener-Policy (défaut: same-origin) */
  coop?: string;
  /** Cross-Origin-Resource-Policy (défaut: same-origin) */
  corp?: string;
}

/**
 * Crée le middleware de headers de sécurité.
 */
export function createSecurityHeaders(config: SecurityHeadersConfig = {}): Middleware {
  const {
    csp = DEFAULT_CSP,
    hsts = true,
    hstsMaxAge = 31536000,
    hstsIncludeSubDomains = true,
    hstsPreload = true,
    frameOptions = "DENY",
    referrerPolicy = "strict-origin-when-cross-origin",
    permissionsPolicy = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    coop = "same-origin",
    corp = "same-origin",
  } = config;

  return async (req, ctx, next) => {
    const res = await next();
    if (!res) return new Response("Internal Server Error", { status: 500 });
    
    // Headers de base (toujours)
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Frame-Options", frameOptions);
    res.headers.set("Referrer-Policy", referrerPolicy);
    res.headers.set("Permissions-Policy", permissionsPolicy);
    res.headers.set("Cross-Origin-Opener-Policy", coop);
    res.headers.set("Cross-Origin-Resource-Policy", corp);
    res.headers.set("Content-Security-Policy", csp);

    // HSTS seulement si HTTPS (détecté via header proxy ou config)
    const isHttps = req.headers.get("x-forwarded-proto") === "https" || 
                    new URL(req.url).protocol === "https:";
    if (hsts && isHttps) {
      let hstsValue = `max-age=${hstsMaxAge}`;
      if (hstsIncludeSubDomains) hstsValue += "; includeSubDomains";
      if (hstsPreload) hstsValue += "; preload";
      res.headers.set("Strict-Transport-Security", hstsValue);
    }

    // Supprimer headers serveur sensibles
    res.headers.delete("Server");
    res.headers.delete("X-Powered-By");

    return res;
  };
}