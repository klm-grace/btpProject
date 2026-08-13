/**
 * apps/api — SEUL process qui écoute un port HTTP.
 *
 * Assemble les bibliothèques (config, db, redis, logger, health, errors,
 * router, http) et expose GET /api/health + GET /api/ready.
 *
 * L'app lit process.env et injecte la config dans les bibliothèques.
 * Les bibliothèques ne lisent JAMAIS process.env.
 */

import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createRedis } from "@libs/redis";
import { createLogger } from "@libs/logger";
import { createHealthChecker } from "@libs/health";
import { createRouter } from "@libs/router";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { formatError } from "@libs/errors";
import { createSecurityHeaders, createCors, createTrustedProxy } from "@libs/http-security";

// ---------------------------------------------------------------------------
// Bootstrap : l'app lit l'env et injecte
// ---------------------------------------------------------------------------

const configResult = createConfig().validate(process.env);
if (!configResult.ok) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Configuration invalide — vérifier .env",
      time: new Date().toISOString(),
    }),
  );
  process.exit(1);
}

const config = configResult.data;
const log = createLogger({ level: config.log.level, formatted: config.log.formatted, baseFields: { service: "api" } });

const db = createDb({ url: config.db.url });
const redis = createRedis({ url: config.redis.url });
const health = createHealthChecker({ db, redis });

// ---------------------------------------------------------------------------
// Sécurité HTTP (bibliothèques injectées, pas de process.env ici)
// ---------------------------------------------------------------------------

const securityHeaders = createSecurityHeaders();
const cors = createCors({
  origins: config.corsOrigins,
  credentials: true,
});
const trustedProxy = createTrustedProxy({ trustProxy: config.trustProxy });

// ---------------------------------------------------------------------------
// Limites serveur : body size + timeout
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 Mo
const REQUEST_TIMEOUT_MS = 10_000;

/** Vérifie le Content-Length de manière sécurisée (rejet si NaN ou > max). */
function isBodyTooLarge(req: Request): boolean {
  const raw = req.headers.get("content-length");
  if (raw === null) return false; // pas de Content-Length → le runtime gère
  const len = Number(raw);
  if (!Number.isFinite(len) || len < 0) return true; // header malformé → rejeter
  return len > MAX_BODY_BYTES;
}

// ---------------------------------------------------------------------------
// Routes (bibliothèque router)
// ---------------------------------------------------------------------------

const router = createRouter({ logger: log.child({ component: "router" }) });

// GET /api/health — endpoint PUBLIC minimal (liveness, pas de détail infra)
router.get("/api/health", async (_req, ctx) => {
  return jsonOk({ ready: true }, { status: 200, requestId: ctx.requestId });
});

// GET /api/health/detail — endpoint INTERNE (détaillé), protégé par monitoringToken
router.get("/api/health/detail", async (req, ctx) => {
  const token = req.headers.get("x-monitoring-token");
  if (!config.monitoringToken || token !== config.monitoringToken) {
    return jsonErrorResponse(
      { code: "forbidden", message: "Invalid or missing monitoring token" },
      403,
    );
  }
  const report = await health.check();
  const status = report.status === "ok" || report.status === "degraded" ? 200 : 503;
  return jsonOk(report, { status, requestId: ctx.requestId });
});

// GET /api/ready — endpoint PUBLIC (readiness, minimal)
router.get("/api/ready", async (_req, ctx) => {
  const report = await health.check();
  const ready = report.status !== "down";
  const status = ready ? 200 : 503;
  return jsonOk({ ready, status: report.status }, {
    status,
    requestId: ctx.requestId,
  });
});

// ---------------------------------------------------------------------------
// Fetch : composition (middleware + body size + timeout + erreur globale)
// ---------------------------------------------------------------------------

async function fetchHandler(req: Request): Promise<Response> {
  // ── CORS preflight (OPTIONS) — géré AVANT le routeur ────────────────────
  const preflight = cors.handlePreflight(req);
  if (preflight) return preflight;

  // ── IP client (trusted proxy) ──────────────────────────────────────────
  const clientIp = trustedProxy.getClientIp(req);

  // ── x-request-id client validé (format simple, longueur limitée) sinon UUID
  const clientRequestId = req.headers.get("x-request-id");
  const requestId =
    clientRequestId && /^[a-zA-Z0-9_-]{1,64}$/.test(clientRequestId)
      ? clientRequestId
      : crypto.randomUUID();
  const t0 = performance.now();
  const reqLog = log.child({ requestId, method: req.method, path: new URL(req.url).pathname, clientIp });

  // Body size limit — vérification applicative (défense en profondeur)
  // Le vrai garde-fou est maxRequestBodySize dans Bun.serve() ci-dessous.
  if (isBodyTooLarge(req)) {
    reqLog.warn("body too large or malformed Content-Length");
    return securityHeaders.applyHeaders(
      jsonErrorResponse(
        { code: "payload_too_large", message: "Request body too large", requestId },
        413,
      ),
    );
  }

  // Timeout + propagation du signal aux handlers
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    reqLog.warn("request timeout");
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await router.handle(
      new Request(req.url, {
        method: req.method,
        headers: withRequestId(req.headers, requestId),
        signal: controller.signal,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? { body: req.body, duplex: "half" as const }
          : {}),
      }),
    );
    const duration = Math.round(performance.now() - t0);
    reqLog.info("request handled", { status: response.status, duration });

    // Appliquer CORS headers + security headers sur TOUTES les réponses
    const corsResult = cors.resolve(req);
    let res = withRequestIdHeader(response, requestId);
    if (corsResult.headers) {
      res = new Response(res.body, res);
      for (const [k, v] of Object.entries(corsResult.headers)) {
        res.headers.set(k, v);
      }
    }
    return securityHeaders.applyHeaders(res);
  } catch (err) {
    const duration = Math.round(performance.now() - t0);

    if (timedOut || controller.signal.aborted) {
      reqLog.warn("request timeout", { duration });
      return securityHeaders.applyHeaders(
        withRequestIdHeader(
          jsonErrorResponse(
            { code: "timeout", message: "Request timeout", requestId },
            504,
          ),
          requestId,
        ),
      );
    }

    const formatted = formatError(err, requestId);
    if (formatted.status >= 500) {
      reqLog.error("unhandled error", { code: formatted.error.code, duration });
    } else {
      reqLog.warn("client error", { code: formatted.error.code, status: formatted.status, duration });
    }
    return securityHeaders.applyHeaders(
      jsonErrorResponse(
        { ...formatted.error, requestId },
        formatted.status,
      ),
    );
  } finally {
    // Toujours nettoyer le timer, même en cas de succès, d'erreur ou d'abort.
    clearTimeout(timeoutHandle);
  }
}

function withRequestId(headers: Headers, requestId: string): Headers {
  // Écrase toujours : le requestId a déjà été validé (ou généré) dans fetchHandler.
  const h = new Headers(headers);
  h.set("x-request-id", requestId);
  return h;
}

function withRequestIdHeader(res: Response, requestId: string): Response {
  res.headers.set("x-request-id", requestId);
  return res;
}

// ---------------------------------------------------------------------------
// Serveur HTTP — seul endroit qui ouvre un port
// ---------------------------------------------------------------------------

const server = Bun.serve({
  hostname: config.server.host,
  port: config.server.port,
  fetch: fetchHandler,
  // Garde-fou runtime : rejette les bodies > 1 Mo AVANT même d'atteindre le handler.
  // Ligne de défense principale (le contrôle applicatif est une défense en profondeur).
  maxRequestBodySize: MAX_BODY_BYTES,
  // Timeout de connexion/idle au niveau Bun
  idleTimeout: 60,
});

log.info("API started", {
  host: config.server.host,
  port: config.server.port,
  env: config.env,
});

// Arrêt propre
async function shutdown(signal: string) {
  log.info("shutting down", { signal });
  server.stop(true);
  await db.close();
  await redis.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { server, config, db, redis, health, log, router };
