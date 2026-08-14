/**
 * Infrastructure de test d'intégration de l'API.
 *
 * Démarrage automatique de l'API en background avant tous les tests
 * d'intégration. Plus de "skip" silencieux — les tests sont auto-suffisants.
 *
 * Usage :
 *   import { withApiServer } from "../test-support/integration-api.ts";
 *
 *   beforeAll(async () => {
 *     const api = await withApiServer();
 *     // api.baseUrl, api.stop()
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
import type { AuthDeps, AuthConfig } from "@libs/auth/types";
import type { RbacDeps, RbacConfig } from "@libs/rbac/types";
import type { CsrfConfig } from "@libs/csrf/types";
import { registerRoutes } from "../apps/api/routes";
import { getRequestId, addRequestIdHeader } from "../apps/api/utils/request-id";
import { isBodyTooLarge, readJsonBody } from "../apps/api/utils/body";
import { parseCookie } from "../apps/api/utils/cookies";
import { MAX_BODY_BYTES, COOKIE_NAMES } from "../apps/api/constants";
import type { AppContext } from "../apps/api/types";

export interface ApiServer {
  baseUrl: string;
  stop: () => Promise<void>;
  ctx: AppContext;
}

/**
 * Démarre une instance de l'API dédiée aux tests (port 4001 pour éviter
 * les conflits avec un éventuel serveur dev). Retourne un helper avec
 * `baseUrl` et `stop()`.
 *
 * Le serveur est lancé dans un worker isolé via `Bun.spawn` pour simuler
 * un vrai process HTTP, tout en gardant la possibilité de l'arrêter proprement.
 */
export async function startTestApiServer(): Promise<ApiServer> {
  // On réutilise la config de dev/test avec un port différent.
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: "4099",  // Port dédié aux tests d'intégration (rarement pris).
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    // CORS : autoriser localhost pour les tests.
    CORS_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
    // Token de monitoring pour les tests de health.
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
    cacheTtlMs: config.rbacCacheTtlMinutes * 60 * 1000,
    cookieName: COOKIE_NAMES.session,
  };
  const rbac = createRbac(rbacDeps, rbacCfg);

  const csrfCfg: CsrfConfig = {
    cookieName: COOKIE_NAMES.csrf,
    headerName: "X-CSRF-Token",
    protectedMethods: ["POST", "PUT", "PATCH", "DELETE"],
    exemptedPaths: ["/api/auth/login", "/api/auth/logout", "/api/auth/csrf"],
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

  const ctx: AppContext = {
    config, log, db, redis, health, auth, rbac, csrf, cors, securityHeaders, trustedProxy,
    rateLimiter, authRateLimiter, authRateLimitMiddleware,
  };

  const router = createRouter();
  registerRoutes(router, ctx);

  const fetchHandler = async (req: Request) => {
    const requestId = getRequestId(req);
    try {
      if (isBodyTooLarge(req, MAX_BODY_BYTES)) {
        return new Response("Request entity too large", { status: 413 });
      }
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

  // Essayer plusieurs ports jusqu'à trouver un libre (évite les conflits
// avec des serveurs orphelins ou des runs parallèles de tests).
  const candidatePorts = [4099, 4098, 4097, 4096, 4095];
  let server: Bun.Server<unknown> | null = null;
  let actualPort: number = 0;
  for (const port of candidatePorts) {
    try {
      server = Bun.serve({ port, hostname: config.server.host, fetch: fetchHandler });
      actualPort = port;
      break;
    } catch {
      continue;
    }
  }
  if (!server) throw new Error("No available port for test API server");

  const baseUrl = `http://${config.server.host}:${actualPort}`;
  const ready = await waitForReady(baseUrl);
  if (!ready) {
    server.stop(true);
    throw new Error(`API server did not become ready at ${baseUrl}`);
  }

  log.info(`Test API Server running at ${baseUrl}`);

  return {
    baseUrl,
    ctx,
    stop: async () => {
      server?.stop(true);
      await db.close();
      await redis.close();
    },
  };
}

/**
 * Attend qu'une URL réponde (max 10s). Utilisé pour s'assurer que le serveur
 * est prêt avant de lancer les tests.
 */
async function waitForReady(baseUrl: string, timeoutMs = 10000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/ready`);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}