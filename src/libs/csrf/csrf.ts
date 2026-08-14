/**
 * CSRF — Bibliothèque de protection CSRF (double-submit cookie).
 */

import { timingSafeEqual } from "@libs/http-security";
import type { Csrf, CsrfConfig } from "./types.ts";

const DEFAULT_HEADER_NAME = "X-CSRF-Token";
const DEFAULT_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Réponse JSON d'erreur CSRF.
 */
function csrfError() {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "csrf_invalid", message: "Invalid or missing CSRF token" },
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Crée le moteur CSRF — double-submit cookie.
 */
export function createCsrf(config: CsrfConfig = {}): Csrf {
  const cookieName = config.cookieName ?? "csrf_token";
  const headerName = config.headerName ?? DEFAULT_HEADER_NAME;
  const exemptedPrefixes = config.exemptedPrefixes ?? ["/api/auth/login", "/api/auth/logout", "/api/auth/csrf"];
  const protectedMethods = config.protectedMethods ?? DEFAULT_PROTECTED_METHODS;

  return {
    /**
     * Génère un token CSRF (64 hex chars, cryptographiquement sûr).
     */
    generate() {
      return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },

    /**
     * Vérifie que le token du header correspond au cookie.
     * Doit échouer si l'un des deux est vide.
     */
    verify(cookieValue: string, headerValue: string) {
      if (!cookieValue || !headerValue) return false;
      return timingSafeEqual(cookieValue, headerValue);
    },

    /**
     * Middleware CSRF pour le routeur.
     */
    middleware: async (req, ctx, next) => {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method.toUpperCase();

      // 1. On ignore les méthodes non protégées (GET, HEAD, OPTIONS)
      if (!protectedMethods.includes(method)) {
        return next();
      }

      // 2. On ignore les paths exemptés (matching par préfixe)
      if (exemptedPrefixes.some((prefix) => path.startsWith(prefix))) {
        return next();
      }

      const cookieHeader = req.headers.get("cookie");
      const cookieToken = parseCookie(cookieHeader, cookieName);
      const headerToken = req.headers.get(headerName);

      if (!cookieToken || !headerToken) {
        return csrfError();
      }

      if (!timingSafeEqual(cookieToken, headerToken)) {
        return csrfError();
      }

      return next();
    },
  };
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
