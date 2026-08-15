/**
 * body — Middleware de parsing et validation des corps de requête.
 *
 * Usage:
 *   const middleware = createBodyMiddleware({ jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   router.use(middleware);
 *
 * Le middleware:
 *   - Parse automatiquement le JSON et attache ctx.state.body
 *   - Vérifie la taille selon Content-Type
 *   - Protège contre la prototype pollution
 *   - Ne fait rien pour les requêtes non-JSON
 */

export { createBodyMiddleware, type BodyMiddlewareConfig } from "./body.ts";