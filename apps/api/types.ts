/**
 * Types applicatifs pour apps/api.
 */

import type { Middleware as BaseMiddleware, RouteContext as BaseRouteContext, RouteHandler as BaseRouteHandler } from "@libs/router/types";

/**
 * Context applicatif injecté dans les handlers et middlewares.
 */
export interface AppContext {
  config: any;
  log: any;
  db: any;
  redis: any;
  health: any;
  auth: any;
  rbac: any;
  csrf: any;
  cors: any;
  securityHeaders: any;
  trustedProxy: any;
  rateLimiter: any;
  authRateLimiter: any;
  authRateLimitMiddleware: any;
}

/**
 * RouteContext étendu pour inclure l'application.
 * On utilise l'intersection pour rester compatible avec @libs/router.
 */
export type RouteContext = BaseRouteContext & { app: AppContext };

/**
 * Middleware étendu pour utiliser le RouteContext de l'application.
 */
export type Middleware = (req: Request, ctx: RouteContext, next: () => Promise<Response | null>) => Promise<Response | null>;

/**
 * Handler étendu pour utiliser le RouteContext de l'application.
 */
export type RouteHandler = (req: Request, ctx: RouteContext) => Promise<Response>;
