/**
 * Types applicatifs pour apps/api.
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
import type { PaginationEngine } from "@libs/pagination";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  mfaEnabled: boolean;
}

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
  storage: StorageProvider & {
    activeBackend: () => "disk" | "r2";
    getDiskSize: () => Promise<number>;
    shouldMigrate: () => Promise<boolean>;
  };
  upload: UploadEngine;
  pagination: PaginationEngine;
  securityEvents: {
    recordEvent(params: {
      userId?: string | null;
      eventType: string;
      ip?: string | null;
      userAgent?: string | null;
      details?: Record<string, unknown>;
    }): Promise<void>;
    getEvents(query?: {
      userIds?: string[];
      eventType?: string | string[];
      limit?: number;
      offset?: number;
    }): Promise<any[]>;
    purgeOldEvents(): Promise<number>;
  };
  adminRateLimiter: {
    check(ip: string, endpoint: string): Promise<{
      allowed: boolean;
      resetSeconds?: number;
      ban?: { banned: boolean; retryAfterSeconds: number; violations: number };
    }>;
    clearBan(ip: string): Promise<void>;
  };
  adminRateLimitMiddleware: (
    req: Request,
    ctx: any,
    next: () => Promise<Response>,
  ) => Promise<Response>;
}

export interface RouteContext extends BaseRouteContext {
  state: BaseRouteContext["state"] & {
    app: AppContext;
    user: AuthUser | null;
  };
}
