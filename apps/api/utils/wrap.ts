/**
 * Helpers pour caster les handlers/middlewares de apps/api vers les types
 * du routeur @libs/router sans passer par `any`.
 *
 * Les handlers/middlewares de apps/api utilisent `RouteContext` (apps/api/types)
 * qui étend `RouteContext` (@libs/router) avec `state: { app: AppContext }`.
 * TypeScript refuse l'assignation directe à cause de la variance de `state`,
 * mais à runtime les types sont compatibles (le router ne lit pas `state.app`).
 *
 * Ces helpers centralisent le cast en UN SEUL ENDROIT, documenté.
 */

import type { Middleware as RouterMiddleware, RouteHandler as RouterRouteHandler } from "@libs/router/types";
import type { RouteContext, RouteHandler, Middleware } from "../types";

/**
 * Caste un RouteHandler de apps/api en RouteHandler du routeur.
 * Le contexte est le même objet à runtime ; seul le type statique diffère.
 */
export function wrapHandler(handler: RouteHandler): RouterRouteHandler {
  return handler as unknown as RouterRouteHandler;
}

/**
 * Caste un Middleware de apps/api en Middleware du routeur.
 */
export function wrapMiddleware(middleware: Middleware): RouterMiddleware {
  return middleware as unknown as RouterMiddleware;
}