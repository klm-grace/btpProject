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
import { z } from "zod";

import { registerRoutes } from "./routes";
import { getRequestId, addRequestIdHeader } from "./utils/request-id";
import { isBodyTooLarge, readJsonBody } from "./utils/body";
import { MAX_BODY_BYTES, COOKIE_NAMES } from "./constants";
import type { AppContext } from "./types";

const EmailSchema = z.string().email().max(254);

async function bootstrap() {
  const configResult = createConfig();
  const config = configResult.parse(process.env);

  const log = createLogger(config.log);
  const db = createDb(config.db);
  const redis = createRedis(config.redis);
  const health = createHealthChecker({ db, redis });
  const auth = createAuth({ db, redis } as any, config as any);
  const rbac = createRbac({ auth } as any, config as any);
  const csrf = createCsrf(config as any);
  const cors = createCors({ origins: config.corsOrigins } as any);
  const securityHeaders = createSecurityHeaders();
  const trustedProxy = createTrustedProxy(config.trustProxy as any);

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

      const response = await router.handle(req, { app: ctx } as any);

      const finalRes = new Response(response.body, response);
      securityHeaders.applyHeaders(finalRes);
      
      const corsRes = cors.resolve(req);
      if (corsRes.headers) {
        for (const [k, v] of Object.entries(corsRes.headers)) {
          finalRes.headers.set(k, v);
        }
      }

      return addRequestIdHeader(finalRes, requestId);
    } catch (e: any) {
      log.error("Unhandled API error", { error: e, requestId });
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
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
