/**
 * Router — routeur HTTP maison strict.
 *
 * Injection : aucune dépendance d'environnement. Aucun port.
 * Le contexte fournit un AbortSignal pour les handlers longs.
 */

export type {
  HttpMethod,
  RouteContext,
  RouteHandler,
  RegisteredRoute,
  Router,
  RouterOptions,
} from "./types.ts";
export { createRouter } from "./router.ts";
export { throwIfAborted, abortPromise } from "./abort.ts";
