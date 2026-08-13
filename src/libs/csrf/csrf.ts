import { timingSafeEqual } from "node:crypto";
import type { Csrf, CsrfConfig } from "./types.ts";
import type { Middleware } from "../router/types.ts";

const DEFAULT_COOKIE_NAME = "csrf_token";
const DEFAULT_HEADER_NAME = "X-CSRF-Token";
const DEFAULT_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const DEFAULT_EXEMPTED_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/csrf"];

/**
 * Parse un cookie par nom depuis le header Cookie.
 */
function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Réponse JSON d'erreur CSRF (non verbeuse pour éviter l'énumération).
 */
function csrfErrorResponse(): Response {
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
 *
 * Le cookie `csrf_token` est HttpOnly=false (accessible au JS).
 * Le header `X-CSRF-Token` doit reproduire la même valeur.
 * Comparaison en temps constant (timingSafeEqual).
 *
 * Exempte les paths publics (login, logout, csrf endpoint) et les GET/HEAD/OPTIONS.
 */
export function createCsrf(config: CsrfConfig = {}): Csrf {
  const cookieName = config.cookieName ?? DEFAULT_COOKIE_NAME;
  const headerName = config.headerName ?? DEFAULT_HEADER_NAME;
  const protectedMethods = config.protectedMethods ?? DEFAULT_PROTECTED_METHODS;
  const exemptedPaths = config.exemptedPaths ?? DEFAULT_EXEMPTED_PATHS;

  function generate(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function verify(cookieValue: string, headerValue: string): boolean {
    if (!cookieValue || !headerValue) return false;
    if (cookieValue.length !== headerValue.length) return false;
    const enc = new TextEncoder();
    return timingSafeEqual(enc.encode(cookieValue), enc.encode(headerValue));
  }

  const middleware: Middleware = async (req, ctx, next) => {
    // Seulement sur les méthodes protégées (POST/PUT/PATCH/DELETE)
    if (!protectedMethods.includes(req.method)) {
      return next();
    }

    // Exempter les paths publics
    const path = ctx.path;
    if (exemptedPaths.some((p) => path === p || path.startsWith(p))) {
      return next();
    }

    // Lire le cookie csrf_token
    const cookieHeader = req.headers.get("cookie");
    const cookieToken = parseCookie(cookieHeader, cookieName);

    // Lire le header X-CSRF-Token
    const headerToken = req.headers.get(headerName.toLowerCase());

    // Les deux doivent être présents et identiques
    if (!verify(cookieToken ?? "", headerToken ?? "")) {
      return csrfErrorResponse();
    }

    return next();
  };

  return { generate, verify, middleware };
}
