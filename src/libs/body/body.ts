/**
 * body — Bibliothèque de vérification de la taille des corps de requête.
 *
 * Inspiré de body-parser (Express) et Hono: le checker expose un middleware
 * qui s'intercepte avant les routes. La config est encapsulée — pas besoin
 * de passer les limites à chaque requête.
 */

import type { Middleware } from "@libs/router/types";

/** Options du checker. */
export interface BodyCheckerConfig {
  /** Taille max pour application/json en bytes (défaut: 4 Ko). */
  jsonMaxBytes: number;
  /** Taille max pour multipart/form-data en bytes (défaut: 10 Mo). */
  multipartMaxBytes: number;
}

/** Réponse retournée quand le body est trop gros. */
export interface BodyTooLargeResponse {
  status: 413;
  body: { success: false; error: { code: string; message: string } };
}

/**
 * Crée un middleware de vérification de taille de body.
 *
 * Usage:
 *   const bodyMiddleware = createBodyMiddleware({ jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   router.use(bodyMiddleware);
 */
export function createBodyMiddleware(config: BodyCheckerConfig): Middleware {
  return async (req, _ctx, next) => {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const raw = req.headers.get("content-length");

    // Pas de Content-Length → on laisse passer (chunked/streaming)
    if (raw === null) return next();

    const len = Number(raw);
    if (!Number.isFinite(len) || len < 0) {
      return new Response(JSON.stringify({ success: false, error: { code: "INVALID_CONTENT_LENGTH", message: "Invalid Content-Length" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let limit: number;
    if (contentType.includes("application/json")) {
      limit = config.jsonMaxBytes;
    } else if (contentType.includes("multipart/form-data")) {
      limit = config.multipartMaxBytes;
    } else {
      limit = config.multipartMaxBytes;
    }

    if (len > limit) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "BODY_TOO_LARGE",
          message: `Request body too large (max ${limit} bytes for ${contentType || "this content-type"})`,
        },
      }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    return next();
  };
}