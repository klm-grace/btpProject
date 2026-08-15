/**
 * body — Bibliothèque de vérification de la taille des corps de requête.
 *
 * Usage:
 *   const checker = createBodyChecker({ jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   if (checker.check(req)) return new Response("Request entity too large", { status: 413 });
 */

export { createBodyChecker, type BodyChecker, type BodyCheckerConfig } from "./body.ts";
