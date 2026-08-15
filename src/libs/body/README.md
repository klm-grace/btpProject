/**
 * body — Middleware de parsing et validation des corps de requête.
 *
 * ## Rôle
 *
 * Middleware de parsing des corps de requête HTTP qui s'intercepte avant
 * les routes pour :
 * - Parser automatiquement le JSON et attacher `ctx.state.body`
 * - Vérifier la taille du body selon Content-Type
 * - Protéger contre la prototype pollution
 * - Rejeter les requêtes `Transfer-Encoding: chunked`
 *
 * ## Usage
 *
 * ```ts
 * import { createBodyMiddleware } from "@libs/body";
 *
 * const bodyMiddleware = createBodyMiddleware({
 *   jsonMaxBytes: 4_096,          // 4 Ko pour JSON
 *   multipartMaxBytes: 10_485_760, // 10 Mo pour uploads
 * });
 *
 * router.use(bodyMiddleware);
 * ```
 *
 * ## Comportement
 *
 * | Content-Type | Action |
 * |---|---|
 * | `application/json` | Parse JSON → `ctx.state.body`, vérifie taille |
 * | `multipart/form-data` | Skip (laisse au handler), vérifie taille |
 * | Autre | Skip (pas de body à parser) |
 * | `Transfer-Encoding: chunked` | Rejet immédiat (400) |
 *
 * ## Sécurité
 *
 * - **Body size limits** : rejet 413 si dépassement
 * - **Prototype pollution** : rejet 400 si `__proto__`, `constructor`, `prototype`
 * - **Chunked encoding** : rejet 400 (bypass Content-Length)
 * - **JSON malformed** : rejet 400
 * - **requestId** : inclus dans toutes les erreurs
 *
 * ## Tests
 *
 * ```bash
 * bun test src/libs/body/body.test.ts
 * ```
 */

export { createBodyMiddleware, type BodyMiddlewareConfig } from "./body.ts";
