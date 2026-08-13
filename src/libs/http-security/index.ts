/**
 * http-security — Bibliothèque de sécurité HTTP réutilisable.
 *
 * Aucun port, aucune lecture de process.env, extraction possible.
 * Config injectée via createXxx(config).
 *
 * Modules :
 * - security-headers : headers de sécurité (HSTS, CSP, X-Frame-Options...)
 * - cors : liste blanche stricte d'origines, gère le preflight OPTIONS
 * - proxy : extraction sécurisée de l'IP client (trusted proxy)
 */
export { createSecurityHeaders } from "./security-headers.ts";
export { createCors } from "./cors.ts";
export { createTrustedProxy } from "./proxy.ts";
export { timingSafeEqual } from "./timing-safe.ts";

export type {
  SecurityHeadersConfig,
  CorsConfig,
  TrustedProxyConfig,
  CorsResult,
} from "./types.ts";
