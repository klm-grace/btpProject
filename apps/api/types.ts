/**
 * Types applicatifs pour apps/api.
 *
 * Les types Db, Logger, HealthChecker, AppConfig sont déclarés globalement
 * dans src/types/global.d.ts (declare global) — pas besoin de les importer.
 */

export type { RouteHandler, Middleware } from "@libs/router/types";
import type { RouteContext as BaseRouteContext } from "@libs/router/types";
import type { AuthEngine } from "@libs/auth";
import type { Rbac } from "@libs/rbac";
import type { Csrf } from "@libs/csrf";
import type { Cors, SecurityHeaders, TrustedProxy } from "@libs/http-security";
import type { RateLimiter, RateLimitMiddleware } from "@libs/rate-limit";
import type { Redis } from "@libs/redis";
import type { Outbox } from "@libs/outbox";
import type { StorageProvider } from "@libs/storage";
import type { UploadEngine } from "@libs/upload";

/** Utilisateur authentifié, injecté par le middleware session. */
export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  mfaEnabled: boolean;
}

/**
 * Contexte applicatif injecté dans les handlers et middlewares.
 * Typé précisément — aucun `any`.
 */
export interface AppContext {
  config: AppConfig;
  log: Logger;
  db: Db;
  redis: Redis;
  health: HealthChecker;
  auth: AuthEngine;
  rbac: Rbac;
  csrf: Csrf;
  cors: Cors;
  securityHeaders: SecurityHeaders;
  trustedProxy: TrustedProxy;
  rateLimiter: RateLimiter;
  authRateLimiter: RateLimiter;
  authRateLimitMiddleware: RateLimitMiddleware;
  outbox: Outbox;
  publicRateLimitMiddleware: RateLimitMiddleware;
  /** Fournisseur de stockage (disk ou R2, injecté par l'app). */
  storage: StorageProvider & {
    activeBackend: () => "disk" | "r2";
    getDiskSize: () => Promise<number>;
    shouldMigrate: () => Promise<boolean>;
  };
  /** Moteur d'upload (validation + stockage + variantes). */
  upload: UploadEngine;
}

/**
 * RouteContext étendu : le contexte de l'app est stocké dans ctx.state.app
 * (conformément au design du routeur @libs/router qui place le contexte
 * passé via `handle(req, context)` dans `ctx.state`).
 */
export interface RouteContext extends BaseRouteContext {
  state: BaseRouteContext["state"] & {
    app: AppContext;
    user: AuthUser | null;
  };
}