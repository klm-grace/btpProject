/**
 * Point d'entrée de l'API.
 * Assemble les bibliothèques et lance le serveur Bun.
 */

import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createRedis } from "@libs/redis";
import { createLogger } from "@libs/logger";
import { createHealthChecker } from "@libs/health";
import { createRouter } from "@libs/router";
import { createSecurityHeaders, createCors, createTrustedProxy } from "@libs/http-security";
import { createAuth } from "@libs/auth";
import { createRbac } from "@libs/rbac";
import { createCsrf } from "@libs/csrf";
import { createRateLimiter, createRateLimitMiddleware } from "@libs/rate-limit";
import { createOutbox, type OutboxDeps, type OutboxConfig } from "@libs/outbox";
import { createStorage } from "@libs/storage";
import { createUpload } from "@libs/upload";
import { createBodyMiddleware } from "@libs/body";
import { jsonError } from "@libs/http";
import type { AuthDeps, AuthConfig } from "@libs/auth/types";
import type { RbacDeps, RbacConfig } from "@libs/rbac/types";
import type { CsrfConfig } from "@libs/csrf/types";
import { z } from "zod";

import { registerRoutes } from "./routes";
import { getRequestId, addRequestIdHeader } from "./utils/request-id";
import { readJsonBody } from "./utils/body";
import { parseCookie } from "./utils/cookies";
import { COOKIE_NAMES } from "./constants";
import type { AppContext } from "./types";

const EmailSchema = z.string().email().max(254);

async function bootstrap() {
  const configResult = createConfig();
  const config = configResult.parse(process.env);

  const log = createLogger(config.log);
  const db = createDb(config.db);
  const redis = createRedis(config.redis);
  const health = createHealthChecker({ db, redis });

  const authDeps: AuthDeps = { db, redis };
  const authCfg: AuthConfig = {
    sessionSecret: config.sessionSecret,
    sessionExpiryHours: config.sessionExpiryHours,
    mfaIssuer: config.mfaIssuer,
    bruteForceMaxAttempts: config.bruteForceMaxAttempts,
    bruteForceLockoutHours: config.bruteForceLockoutHours,
  };
  const auth = createAuth(authDeps, authCfg);

  const rbacDeps: RbacDeps = {
    sessionReader: async (req) => {
      const cookieHeader = req.headers.get("cookie");
      const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);
      if (!sessionId) return null;
      const user = await auth.getSession(sessionId);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        roles: user.roles,
        mfaEnabled: user.mfaEnabled,
      };
    },
    db: { sql: db.sql },
  };
  const rbacCfg: RbacConfig = {
    cacheTtlMs: config.rbacCacheTtlMinutes * 60 * 1000,
    cookieName: COOKIE_NAMES.session,
  };
  const rbac = createRbac(rbacDeps, rbacCfg);

  const csrfCfg: CsrfConfig = {
    cookieName: COOKIE_NAMES.csrf,
    headerName: "X-CSRF-Token",
    protectedMethods: ["POST", "PUT", "PATCH", "DELETE"],
    exemptedPrefixes: ["/api/auth/login", "/api/auth/logout", "/api/auth/csrf", "/api/public"],
  };
  const csrf = createCsrf(csrfCfg);

  const cors = createCors({ origins: config.corsOrigins });
  const securityHeaders = createSecurityHeaders();
  const trustedProxy = createTrustedProxy({ trustProxy: config.trustProxy });

  // Rate limiter global (pour auth et futures routes)
  const rateLimiter = createRateLimiter({ redis }, {
    maxRequests: 100,
    windowSeconds: 60, // 100 req/min par IP
    keyPrefix: "rl:api:"
  });

  // Rate limiter strict pour auth (login, register, mfa)
  const authRateLimiter = createRateLimiter({ redis }, {
    maxRequests: 10,
    windowSeconds: 300, // 10 req/5min par IP
    keyPrefix: "rl:auth:"
  });

  const authRateLimitMiddleware = createRateLimitMiddleware(authRateLimiter, {
    keyGenerator: (req) => {
      // IP + endpoint pour différencier login/logout/mfa
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";
      const url = new URL(req.url);
      return `${ip}:${url.pathname}`;
    },
    message: "Trop de tentatives, veuillez patienter",
    errorCode: "AUTH_RATE_LIMIT_EXCEEDED",
  });

  // Rate limiter public (formulaires contact/devis)
  const publicRateLimiter = createRateLimiter({ redis }, {
    maxRequests: config.publicRateLimitMax,
    windowSeconds: config.publicRateLimitWindow,
    keyPrefix: "rl:public:"
  });
  const publicRateLimitMiddleware = createRateLimitMiddleware(publicRateLimiter, {
    keyGenerator: (req) => {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";
      const url = new URL(req.url);
      return `${ip}:${url.pathname}`;
    },
    message: "Trop de tentatives, veuillez patienter",
    errorCode: "PUBLIC_RATE_LIMIT_EXCEEDED",
  });

  // Outbox pour les notifications email
  const outboxCfg: OutboxConfig = { consentVersion: config.consentVersion };
  const outboxDeps: OutboxDeps = { db, log };
  const outbox = createOutbox(outboxDeps, outboxCfg);

  // Body middleware — limites selon Content-Type
  const bodyMiddleware = createBodyMiddleware({
    jsonMaxBytes: 4 * 1024, // 4 Ko pour JSON
    jsonMaxDepth: 32,
    formMaxBytes: 4 * 1024,
    formMaxKeys: 100,
    formKeyMaxBytes: 100,
    textMaxBytes: 1024,
    xmlMaxBytes: 100 * 1024,
    xmlMaxDepth: 16,
    xmlMaxElements: 1000,
    multipartMaxBytes: config.storage.maxFileSizeBytes, // 10 Mo pour uploads
    readTimeoutMs: 5000,
  });

  // Storage — disque local ou R2, avec migration automatique
  const storageConfig = {
    backend: config.storage.backend,
    diskPath: config.storage.diskPath,
    diskMaxBytes: config.storage.diskMaxBytes,
    r2AccountId: "", // non utilisé dans la config actuelle
    r2Endpoint: config.storage.backend === "r2" ? "https://r2.cloudflarestorage.com" : "",
    r2Bucket: "btp-media",
    r2AccessKeyId: process.env.STORAGE_R2_ACCESS_KEY_ID ?? "",
    r2SecretAccessKey: process.env.STORAGE_R2_SECRET_ACCESS_KEY ?? "",
  };
  const storage = createStorage({ log }, storageConfig);

  // Upload engine
  const uploadConfig = {
    maxFileSizeBytes: config.storage.maxFileSizeBytes,
    allowedMimeTypes: config.storage.allowedMimeTypes,
    imageMaxWidth: config.storage.imageMaxWidth,
    imageMaxHeight: config.storage.imageMaxHeight,
    variantSizes: config.storage.variantSizes,
    webpQuality: 80,
  };
  const upload = createUpload({ storage, log: log.child({ module: "upload" }) }, uploadConfig);

  const ctx: AppContext = {
    config, log, db, redis, health, auth, rbac, csrf, cors, securityHeaders, trustedProxy,
    rateLimiter, authRateLimiter, authRateLimitMiddleware, outbox, publicRateLimitMiddleware,
    storage, upload,
  };

  const router = createRouter();
  // Body middleware — vérifié AVANT toutes les routes
  router.use(bodyMiddleware);
  registerRoutes(router, ctx);

  const fetchHandler = async (req: Request) => {
    const requestId = getRequestId(req);

    try {
      // Le body middleware est géré par router.use() avant les routes

      const preflight = cors.handlePreflight(req);
      if (preflight) return preflight;

      const response = await router.handle(req, { app: ctx });

      const finalRes = securityHeaders.applyHeaders(new Response(response.body, response));

      const corsRes = cors.resolve(req);
      if (corsRes.headers) {
        for (const [k, v] of Object.entries(corsRes.headers)) {
          finalRes.headers.set(k, v);
        }
      }

      return addRequestIdHeader(finalRes, requestId);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      log.error("Unhandled API error", { error: err, requestId });
      return jsonError({ code: "INTERNAL_ERROR", message: "Internal Server Error" }, 500);
    }
  };

  const server = Bun.serve({
    port: config.server.port,
    hostname: config.server.host,
    fetch: fetchHandler,
  });

  log.info(`API Server running at http://${server.hostname}:${server.port}`);
  return { server, ctx };
}

bootstrap().catch((e) => {
  console.error("Fatal bootstrap error:", e);
  process.exit(1);
});
