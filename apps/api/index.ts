/**
 * apps/api — SEUL process qui écoute un port HTTP.
 *
 * Assemble les bibliothèques (config, db, redis, logger, health, errors)
 * et expose GET /health.
 *
 * L'app lit process.env et injecte la config dans les bibliothèques.
 * Les bibliothèques ne lisent JAMAIS process.env.
 */

import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createRedis } from "@libs/redis";
import { createLogger } from "@libs/logger";
import { createHealthChecker } from "@libs/health";
import { formatError, NotFoundError } from "@libs/errors";

// ---------------------------------------------------------------------------
// Bootstrap : l'app lit l'env et injecte
// ---------------------------------------------------------------------------

const configResult = createConfig().validate(process.env);
if (!configResult.ok) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Configuration invalide vérifier .env",
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
// Routes
// ---------------------------------------------------------------------------

async function handleHealth(_req: Request): Promise<Response> {
  const report = await health.check();
  const httpStatus = report.status === "ok" ? 200 : report.status === "degraded" ? 200 : 503;
  return Response.json(report, { status: httpStatus });
}

async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return await handleHealth(req);
    }

    throw new NotFoundError(`Route not found: ${req.method} ${url.pathname}`);
  } catch (err) {
    const body = formatError(err);
    if (body.status >= 500) {
      log.error("unhandled error", { code: body.error.code });
    }
    return Response.json({ error: body.error }, { status: body.status });
  }
}

// ---------------------------------------------------------------------------
// Serveur HTTP — seul endroit qui ouvre un port
// ---------------------------------------------------------------------------

const server = Bun.serve({
  hostname: config.server.host,
  port: config.server.port,
  fetch: router,
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

export { server, config, db, redis, health, log };
