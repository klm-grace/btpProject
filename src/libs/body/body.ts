/**
 * body — Middleware de parsing et validation des corps de requête.
 *
 * Inspiré de body-parser (Express) et Hono: ce middleware s'intercepte
 * avant les routes et:
 *  1. Vérifie la taille du body selon Content-Type
 *  2. Parse automatiquement le JSON et attache ctx.state.body
 *  3. Rejette les tentatives de prototype pollution
 *  4. Rejette les requêtes chunked (sécurité anti-bypass)
 *  5. Ne fait rien pour les requêtes non-JSON (GET, multipart, etc.)
 *
 * Usage:
 *   const bodyMiddleware = createBodyMiddleware({ jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   router.use(bodyMiddleware);
 */

import type { Middleware } from "@libs/router/types";

/** Options du middleware. */
export interface BodyMiddlewareConfig {
  /** Taille max pour application/json en bytes (défaut: 4 Ko). */
  jsonMaxBytes: number;
  /** Taille max pour multipart/form-data en bytes (défaut: 10 Mo). */
  multipartMaxBytes: number;
}

/** Clés interdites dans le JSON (prototype pollution defense). */
const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Vérifie si un objet contient des clés dangereuses (prototype pollution).
 */
function hasPrototypePollution(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object") return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  return keys.some((k) => PROHIBITED_KEYS.has(k));
}

/**
 * Crée un middleware de parsing et validation des corps de requête.
 */
export function createBodyMiddleware(config: BodyMiddlewareConfig): Middleware {
  return async (req, ctx, next) => {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const raw = req.headers.get("content-length");
    const transferEncoding = (req.headers.get("transfer-encoding") || "").toLowerCase();

    // ── Rejet explicite de Transfer-Encoding: chunked ─────────────────────
    // Chunked encoding bypass la vérification Content-Length → risque DoS
    if (transferEncoding.includes("chunked")) {
      return new Response(
        JSON.stringify({ success: false, error: { code: "CHUNKED_ENCODING_NOT_ALLOWED", message: "Chunked transfer encoding is not allowed" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Déterminer la limite selon Content-Type ───────────────────────────
    let limit: number | null = null;
    let parseJson = false;

    if (contentType.includes("application/json")) {
      limit = config.jsonMaxBytes;
      parseJson = true;
    } else if (contentType.includes("multipart/form-data")) {
      limit = config.multipartMaxBytes;
    } else {
      // Pas de body à parser (GET, etc.)
      return next();
    }

    // ── Vérification Content-Length ──────────────────────────────────────
    if (raw === null) {
      // Pas de Content-Length → on laisse passer (streaming possible)
      // Mais si on doit parser du JSON, on prend le risque
      if (!parseJson) return next();
    } else {
      const len = Number(raw);
      if (!Number.isFinite(len) || len < 0) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "INVALID_CONTENT_LENGTH", message: "Invalid Content-Length", requestId: ctx.requestId } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (limit !== null && len > limit) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "BODY_TOO_LARGE",
              message: `Request body too large (max ${limit} bytes)`,
              requestId: ctx.requestId,
            },
          }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // ── Parser le JSON si requis ─────────────────────────────────────────
    if (parseJson) {
      let body: Record<string, unknown>;
      try {
        const text = await req.text();
        if (!text || text.trim() === "") {
          body = {};
        } else {
          body = JSON.parse(text) as Record<string, unknown>;
        }
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body", requestId: ctx.requestId } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // ── Protection prototype pollution ───────────────────────────────
      if (hasPrototypePollution(body)) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "PROTOTYPE_POLLUTION", message: "Invalid request body", requestId: ctx.requestId } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Attacher le body parsé au contexte
      ctx.state.body = body;
    }

    return next();
  };
}
