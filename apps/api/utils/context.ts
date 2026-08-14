/**
 * Helper type-safe pour accéder au contexte applicatif depuis un handler/middleware.
 *
 * Le routeur @libs/router place le contexte passé via `handle(req, context)`
 * dans `ctx.state`. L'application injecte `{ app: ctx }` dans ce context.
 * Comme `RouteContext.state` est une index signature (`Record<string, unknown>`),
 * TypeScript ne peut pas typer `ctx.state.app` automatiquement.
 *
 * Ce helper centralise l'accès type-safe en UN SEUL ENDROIT avec un cast
 * explicite vers `AppContext` (jamais `any`). Tous les handlers/middlewares
 * l'utilisent au lieu d'accéder directement à `ctx.state.app`.
 */

import type { AppContext } from "../types";

/**
 * Récupère le contexte applicatif depuis un RouteContext.
 * Lance une erreur de développement si l'app n'est pas injectée (route non montée).
 */
export function getAppContext(ctx: { state: Record<string, unknown> }): AppContext {
  const app = ctx.state.app as AppContext | undefined;
  if (!app) {
    throw new Error("AppContext not found in ctx.state.app — route registered without application context");
  }
  return app;
}