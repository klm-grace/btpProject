/**
 * body — Bibliothèque de vérification de la taille des corps de requête.
 *
 * Le checker s'utilise comme un middleware (pattern Express/Hono) :
 *   const middleware = createBodyMiddleware({ jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   router.use(middleware);
 *
 * Aucune vérification manuelle dans fetchHandler.
 */

export { createBodyMiddleware, type BodyCheckerConfig } from "./body.ts";
