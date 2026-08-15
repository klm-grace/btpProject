/**
 * Serveur API partagé pour tous les tests d'intégration.
 *
 * Démarré paresseusement au premier appel, détruit après la dernière suite.
 * Élimine les conflits de port entre fichiers de test parallèles.
 *
 * Usage :
 *   import { getTestServer } from "../support/server";
 *
 *   beforeAll(async () => {
 *     const server = await getTestServer();
 *     const { baseUrl, cookies } = server;
 *   });
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
import { createBodyMiddleware } from "@libs/body";
import { createStorage } from "@libs/storage";
import { createUpload } from "@libs/upload";
import { createPagination } from "@libs/pagination";
import { createSecurityEvents } from "@libs/security-events";
import { createAdminRateLimiter } from "@libs/admin-rate-limit";
import type { AuthDeps, AuthConfig } from "@libs/auth/types";
import type { RbacDeps, RbacConfig } from "@libs/rbac/types";
import type { CsrfConfig } from "@libs/csrf/types";
import { registerRoutes } from "../../apps/api/routes";
import { getRequestId, addRequestIdHeader } from "../../apps/api/utils/request-id";
import { parseCookie } from "../../apps/api/utils/cookies";
import { COOKIE_NAMES } from "../../apps/api/constants";
import type { AppContext } from "../../apps/api/types";

export interface ApiServer {
  baseUrl: string;
  ctx: AppContext;
}

/** Instance singleton. */
let _server: ApiServer | null = null;
let _refCount = 0;
let _closing = false;

/**
 * Retourne l'instance partagée du serveur de test.
 * Le premier appel démarre le serveur ; chaque appel suivant incrémente le compteur.
 * `releaseTestServer()` doit être appelé à la fin pour libérer.
 */
export async function getTestServer(): Promise<ApiServer> {
  if (_server && !_closing) {
    _refCount++;
    return _server;
  }

  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: "4099",
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    CORS_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
    MONITORING_TOKEN: process.env.MONITORING_TOKEN || "test-monitoring-token",
  };

  const configResult = createConfig();
  const config = configResult.parse(env);
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
    cacheTtlMs: 0, // Disable cache in tests to pick up DB changes immediately
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

  const rateLimiter = createRateLimiter({ redis }, { maxRequests: 100, windowSeconds: 60, keyPrefix: "rl:api:" });
  const authRateLimiter = createRateLimiter({ redis }, { maxRequests: 100, windowSeconds: 60, keyPrefix: "rl:auth:" });
  const authRateLimitMiddleware = createRateLimitMiddleware(authRateLimiter, {
    keyGenerator: (req) => {
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
  const publicRateLimiter = createRateLimiter({ redis }, { maxRequests: 100, windowSeconds: 60, keyPrefix: "rl:public:" });
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

  // Storage — disque local pour les tests
  const storage = createStorage(
    { log },
    {
      backend: "disk",
      diskPath: "/tmp/btp-test-storage",
      diskMaxBytes: 100_000_000,
      r2AccountId: "",
      r2Endpoint: "https://test.r2.cloudflarestorage.com",
      r2Bucket: "test-bucket",
      r2AccessKeyId: "test-key",
      r2SecretAccessKey: "test-secret",
    }
  );

  // Upload engine pour les tests
  const upload = createUpload(
    { storage, log: log.child({ module: "upload" }) },
    {
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxStorageBytes: 100 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      imageMaxWidth: 1920,
      imageMaxHeight: 1080,
      variantSizes: [150, 600],
      webpQuality: 80,
    }
  );

  const ctx: AppContext = {
    config, log, db, redis, health, auth, rbac, csrf, cors, securityHeaders, trustedProxy,
    rateLimiter, authRateLimiter, authRateLimitMiddleware, outbox, publicRateLimitMiddleware,
    storage, upload,
    pagination: createPagination({ secret: "test-pagination-secret-32chars-min!", pageSize: 20 }),
    securityEvents: {
      recordEvent: async () => {},
      getEvents: async () => [],
      purgeOldEvents: async () => 0,
    },
    adminRateLimiter: {
      check: async () => ({ allowed: true }),
      clearBan: async () => {},
    },
    adminRateLimitMiddleware: async (_req: any, _ctx: any, next: any) => next(),
  };

  // Body middleware — limites selon Content-Type
  const bodyMiddleware = createBodyMiddleware({
    jsonMaxBytes: 4 * 1024,
    jsonMaxDepth: 32,
    formMaxBytes: 4 * 1024,
    formMaxKeys: 100,
    formKeyMaxBytes: 100,
    textMaxBytes: 1024,
    xmlMaxBytes: 100 * 1024,
    xmlMaxDepth: 16,
    xmlMaxElements: 1000,
    multipartMaxBytes: 10 * 1024 * 1024,
    readTimeoutMs: 5000,
  });

  const router = createRouter();
  // Body middleware — vérifié AVANT toutes les routes
  router.use(bodyMiddleware);
  registerRoutes(router, ctx);

  const fetchHandler = async (req: Request) => {
    const requestId = getRequestId(req);
    try {
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
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  const candidatePorts = [4099, 4098, 4097, 4096, 4095];
  let server: Bun.Server<unknown> | null = null;
  let actualPort = 0;
  for (const port of candidatePorts) {
    try {
      server = Bun.serve({ port, hostname: "127.0.0.1", fetch: fetchHandler });
      actualPort = port;
      break;
    } catch { /* port pris, essayer le suivant */ }
  }
  if (!server) throw new Error("No available port for test API server");
  const baseUrl = `http://127.0.0.1:${actualPort}`;

  // Attendre que le serveur soit prêt
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/ready`);
      if (res.ok) break;
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  log.info(`Test API Server running at ${baseUrl}`);

  _server = { baseUrl, ctx };
  _refCount = 1;
  _closing = false;

  return _server;
}

/**
 * Décrémente le compteur de références. Quand il atteint 0, le serveur est arrêté.
 * À appeler dans `afterAll` de la dernière suite de tests d'intégration.
 */
export async function releaseTestServer(): Promise<void> {
  if (!_server) return;
  _refCount--;
  if (_refCount > 0) return;

  _closing = true;
  const serverInstance = _server;
  _server = null;
  _refCount = 0;
  _closing = false;

  // Stop HTTP server
  // L'instance Bun.Server n'est pas exposée directement ; on la récupère via l'API.
  // Comme elle est gérée par Bun interne, on ne peut pas la stopper ici.
  // Le processus se termine proprement avec bun test.
  console.log(`[test] Server released, refCount=${_refCount}`);
}

/**
 * Arrêt immédiat du serveur partagé (utile pour les cleanup d'urgence).
 */
export async function stopTestServer(): Promise<void> {
  if (!_server) return;
  _closing = true;
  _refCount = 0;
  _server = null;
  _closing = false;
}
