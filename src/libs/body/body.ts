/**
 * body — Bibliothèque de vérification de la taille des corps de requête.
 *
 * Inspiré de body-parser (Express) et Hono body: chaque parser a ses propres options
 * encapsulées. L'appel `checker.check(req)` suffit — pas besoin de passer les limites
 * à chaque appel.
 */

/** Options du checker. */
export interface BodyCheckerConfig {
  /** Taille max pour application/json en bytes (défaut: 4 Ko). */
  jsonMaxBytes: number;
  /** Taille max pour multipart/form-data en bytes (défaut: 10 Mo). */
  multipartMaxBytes: number;
}

/** Checker de taille de body. */
export interface BodyChecker {
  /** Retourne true si le body dépasse la limite. */
  check(req: Request): boolean;
}

/** Crée un checker de taille de body avec les limites configurées. */
export function createBodyChecker(config: BodyCheckerConfig): BodyChecker {
  return {
    check(req: Request): boolean {
      const contentType = (req.headers.get("content-type") || "").toLowerCase();
      const raw = req.headers.get("content-length");
      if (raw === null) return false;
      const len = Number(raw);
      if (!Number.isFinite(len) || len < 0) return true;

      if (contentType.includes("application/json")) return len > config.jsonMaxBytes;
      if (contentType.includes("multipart/form-data")) return len > config.multipartMaxBytes;
      return len > config.multipartMaxBytes;
    },
  };
}