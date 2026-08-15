/**
 * body — Bibliothèque de parser et validation de corps de requête.
 *
 * ## Rôle
 *
 * Incapsuler la vérification de taille des bodies HTTP selon le Content-Type :
 * - `application/json` → limite stricte (4 Ko par défaut)
 * - `multipart/form-data` → limite plus宽松 (10 Mo par défaut)
 * - Autre → limite multipart
 *
 * ## Usage
 *
 * ```ts
 * import { createBodyParser } from "@libs/body";
 *
 * const parser = createBodyParser(
 *   { log },
 *   { jsonMaxBytes: 4096, multipartMaxBytes: 10 * 1024 * 1024 }
 * );
 *
 * // Dans le fetchHandler :
 * const tooLarge = parser.check(req);
 * if (tooLarge) return tooLarge;
 *
 * // Pour parser du JSON :
 * const body = await parser.parseJson(req);
 * ```
 *
 * ## Sécurité
 *
 * - Vérification **avant** tout parsing (pas de buffer mémoires inutiles)
 * - Basé sur `Content-Length` header (rejet rapide)
 * - JSON malformed → erreur `invalid_json_body` (pas d'information exposée)
 * - Body trop gros → erreur `body_too_large` (pas de détails exposés)
 */

export { createBodyParser } from "./body.ts";
export type { BodyConfig, BodyDeps, BodyParser } from "./types.ts";
