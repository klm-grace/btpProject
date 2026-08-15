/**
 * body — Middleware de parsing et validation des corps de requête multi-format.
 *
 * Usage:
 *   const middleware = createBodyMiddleware({ jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   router.use(middleware);
 *
 * Le middleware:
 *   - Parse automatiquement JSON, form-urlencoded, text/plain, XML
 *   - Attache ctx.state.body
 *   - Vérifie la taille selon Content-Type
 *   - Protège contre la prototype pollution
 *   - Bloque Transfer-Encoding: chunked
 *   - Ne fait rien pour les requêtes non-JSON (GET, multipart, etc.)
 */

export { createBodyMiddleware } from "./body.ts";
export type { BodyMiddlewareConfig } from "./types.ts";