import type { CorsConfig, CorsResult } from "./types.ts";

const DEFAULT_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Request-Id";
const DEFAULT_EXPOSED_HEADERS = "X-Request-Id";
const DEFAULT_MAX_AGE = 86_400;

/**
 * Crée un gestionnaire CORS avec liste blanche stricte.
 *
 * - `origins` : liste des origines autorisées (pas de wildcard en prod).
 * - Jamais `credentials: true` avec `Access-Control-Allow-Origin: *`.
 * - Gère le preflight OPTIONS automatiquement.
 * - Testable unitairement sur des Request factices, sans serveur.
 */
export function createCors(config: CorsConfig) {
  const origins = new Set(config.origins.map((o) => o.replace(/\/$/, "")));
  const methods = config.methods?.join(", ") ?? DEFAULT_METHODS;
  const allowedHeaders = config.allowedHeaders?.join(", ") ?? DEFAULT_ALLOWED_HEADERS;
  const exposedHeaders = config.exposedHeaders?.join(", ") ?? DEFAULT_EXPOSED_HEADERS;
  const credentials = config.credentials ?? false;
  const maxAge = config.maxAge ?? DEFAULT_MAX_AGE;

  /**
   * Résout l'origine d'une requête et retourne les headers CORS.
   * Retourne `allowed: false` si l'origine n'est pas dans la liste blanche.
   */
  function resolve(request: Request): CorsResult {
    const origin = request.headers.get("Origin");

    // Pas d'origine → pas de CORS (server-to-server, curl, etc.)
    if (!origin) {
      return { allowed: true, headers: null };
    }

    const normalized = origin.replace(/\/$/, "");
    if (!origins.has(normalized)) {
      return {
        allowed: false,
        headers: {
          "Access-Control-Allow-Origin": "null",
        },
      };
    }

    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": allowedHeaders,
      "Access-Control-Expose-Headers": exposedHeaders,
      "Access-Control-Max-Age": String(maxAge),
    };

    if (credentials) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }

    return { allowed: true, headers };
  }

  /**
   * Gère une requête preflight OPTIONS (retourne une Response 204 avec headers CORS).
   * Retourne `null` si ce n'est pas un preflight.
   */
  function handlePreflight(request: Request): Response | null {
    if (request.method !== "OPTIONS") return null;

    const result = resolve(request);

    // Preflight rejeté → 403
    if (!result.allowed) {
      return new Response(null, {
        status: 403,
        statusText: "Forbidden",
        headers: result.headers ?? {},
      });
    }

    return new Response(null, {
      status: 204,
      headers: result.headers ?? {},
    });
  }

  return { resolve, handlePreflight };
}
