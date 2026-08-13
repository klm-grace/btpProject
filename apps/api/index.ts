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
const log = createLogger({ level: config.log.level, baseFields: { service: "api" } });

const db = createDb({ url: config.db.url });
const redis = createRedis({ url: config.redis.url });
const health = createHealthChecker({ db, redis });

// ---------------------------------------------------------------------------
// Limites serveur : body size + timeout
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 Mo
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Routes (bibliothèque router)
// ---------------------------------------------------------------------------

const router = createRouter({ logger: log.child({ component: "router" }) });

router.get("/api/health", async (_req, ctx) => {
  const report = await health.check();
  const status = report.status === "ok" || report.status === "degraded" ? 200 : 503;
  return jsonOk(report, { status, requestId: ctx.requestId });
});

router.get("/api/ready", async (_req, ctx) => {
  const report = await health.check();
  const ready = report.status !== "down";
  const status = ready ? 200 : 503;
  return jsonOk({ ready, status: report.status, dependencies: report.dependencies }, {
    status,
    requestId: ctx.requestId,
  });
});

// ---------------------------------------------------------------------------
// Fetch : composition (middleware + body size + timeout + erreur globale)
// ---------------------------------------------------------------------------

async function fetchHandler(req: Request): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const t0 = performance.now();
  const reqLog = log.child({ requestId, method: req.method, path: new URL(req.url).pathname });

  // Body size limit
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    reqLog.warn("body too large", { size: contentLength });
    return jsonErrorResponse(
      { code: "payload_too_large", message: "Request body too large", requestId },
      413,
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
    return withRequestIdHeader(response, requestId);
  } catch (err) {
    const duration = Math.round(performance.now() - t0);

    if (timedOut || controller.signal.aborted) {
      reqLog.warn("request timeout", { duration });
      return withRequestIdHeader(
        jsonErrorResponse(
          { code: "timeout", message: "Request timeout", requestId },
          504,
        ),
        requestId,
      );
    }

    const formatted = formatError(err, requestId);
    if (formatted.status >= 500) {
      reqLog.error("unhandled error", { code: formatted.error.code, duration });
    } else {
      reqLog.warn("client error", { code: formatted.error.code, status: formatted.status, duration });
    }
    return jsonErrorResponse(
      { ...formatted.error, requestId },
      formatted.status,
    );
  } finally {
    // Toujours nettoyer le timer, même en cas de succès, d'erreur ou d'abort.
    clearTimeout(timeoutHandle);
  }
}

function withRequestId(headers: Headers, requestId: string): Headers {
  const h = new Headers(headers);
  if (!h.get("x-request-id")) h.set("x-request-id", requestId);
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
