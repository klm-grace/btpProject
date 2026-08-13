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
import { createSecurityHeaders, createCors, createTrustedProxy, timingSafeEqual } from "@libs/http-security";
import { createAuth } from "@libs/auth";

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
// Auth (bibliothèque injectée, pas de process.env ici)
// ---------------------------------------------------------------------------

const auth = createAuth(
  { db, redis },
  {
    sessionSecret: config.sessionSecret,
    sessionExpiryHours: config.sessionExpiryHours,
    mfaIssuer: config.mfaIssuer,
    bruteForceMaxAttempts: config.bruteForceMaxAttempts,
    bruteForceLockoutHours: config.bruteForceLockoutHours,
  },
);

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
  if (!config.monitoringToken || !token || !timingSafeEqual(token, config.monitoringToken)) {
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
// Helper : lire le body JSON d'une requête
// ---------------------------------------------------------------------------

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json_body");
  }
}

// ---------------------------------------------------------------------------
// Routes Auth
// ---------------------------------------------------------------------------

// POST /api/auth/login — Connexion utilisateur
router.post("/api/auth/login", async (req, ctx) => {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonErrorResponse({ code: "invalid_body", message: "Invalid JSON body", requestId: ctx.requestId }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return jsonErrorResponse({ code: "validation_error", message: "Email and password are required", requestId: ctx.requestId }, 400);
  }

  const result = await auth.login(email, password, {
    ip: trustedProxy.getClientIp(req) ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.success) {
    // Cas spécial MFA : renvoyer le pendingToken (pas une erreur de credentials)
    if (result.error === "mfa_required" && result.pendingToken) {
      const res = jsonOk({ mfaRequired: true, pendingToken: result.pendingToken }, {
        status: 200,
        requestId: ctx.requestId,
      });
      return res;
    }
    return jsonErrorResponse({ code: result.error!, message: "Invalid credentials", requestId: ctx.requestId }, 401);
  }

  const cookie = `sid=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${config.sessionExpiryHours * 3600}`;
  const csrfToken = auth.generateCsrfToken();
  const csrfCookie = `csrf_token=${csrfToken}; Path=/; SameSite=Strict; Max-Age=${config.sessionExpiryHours * 3600}`;

  const res = jsonOk(result.user, { requestId: ctx.requestId });
  res.headers.set("Set-Cookie", `${cookie}; ${csrfCookie}`);
  res.headers.set("X-CSRF-Token", csrfToken);
  return res;
});

// POST /api/auth/logout — Déconnexion
router.post("/api/auth/logout", async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sid = parseCookie(cookieHeader, "sid");
  if (!sid) {
    return jsonOk({ loggedOut: true }, { requestId: ctx.requestId });
  }
  await auth.logout(sid);

  const res = jsonOk({ loggedOut: true }, { requestId: ctx.requestId });
  res.headers.set("Set-Cookie", "sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
  return res;
});

// GET /api/auth/me — Profil utilisateur (vérifie session)
router.get("/api/auth/me", async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sid = parseCookie(cookieHeader, "sid");
  if (!sid) {
    return jsonErrorResponse({ code: "unauthorized", message: "Not authenticated", requestId: ctx.requestId }, 401);
  }

  const user = await auth.getSession(sid);
  if (!user) {
    return jsonErrorResponse({ code: "unauthorized", message: "Invalid session", requestId: ctx.requestId }, 401);
  }

  return jsonOk(user, { requestId: ctx.requestId });
});

// POST /api/auth/change-password — Changement de mot de passe
router.post("/api/auth/change-password", async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sid = parseCookie(cookieHeader, "sid");
  if (!sid) {
    return jsonErrorResponse({ code: "unauthorized", message: "Not authenticated", requestId: ctx.requestId }, 401);
  }

  const user = await auth.getSession(sid);
  if (!user) {
    return jsonErrorResponse({ code: "unauthorized", message: "Invalid session", requestId: ctx.requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonErrorResponse({ code: "invalid_body", message: "Invalid JSON body", requestId: ctx.requestId }, 400);
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return jsonErrorResponse({ code: "validation_error", message: "Current and new password are required", requestId: ctx.requestId }, 400);
  }

  if (newPassword.length < 8) {
    return jsonErrorResponse({ code: "validation_error", message: "Password must be at least 8 characters", requestId: ctx.requestId }, 400);
  }

  const result = await auth.changePassword(user.id, currentPassword, newPassword);
  if (!result.ok) {
    return jsonErrorResponse({ code: result.error!, message: "Password change failed", requestId: ctx.requestId }, 400);
  }

  // Le changement de mot de passe invalide toutes les sessions → on supprime le cookie
  const res = jsonOk({ changed: true }, { requestId: ctx.requestId });
  res.headers.set("Set-Cookie", "sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
  return res;
});

// POST /api/auth/mfa/verify-login — 2e étape du login quand MFA est activé
router.post("/api/auth/mfa/verify-login", async (req, ctx) => {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonErrorResponse({ code: "invalid_body", message: "Invalid JSON body", requestId: ctx.requestId }, 400);
  }

  const pendingToken = typeof body.pendingToken === "string" ? body.pendingToken : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!pendingToken || !code) {
    return jsonErrorResponse({ code: "validation_error", message: "pendingToken and code are required", requestId: ctx.requestId }, 400);
  }

  const result = await auth.completeMfaLogin(pendingToken, code, {
    ip: trustedProxy.getClientIp(req) ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.success) {
    return jsonErrorResponse({ code: result.error!, message: "Invalid credentials", requestId: ctx.requestId }, 401);
  }

  const cookie = `sid=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${config.sessionExpiryHours * 3600}`;
  const csrfToken = auth.generateCsrfToken();
  const csrfCookie = `csrf_token=${csrfToken}; Path=/; SameSite=Strict; Max-Age=${config.sessionExpiryHours * 3600}`;

  const res = jsonOk(result.user, { requestId: ctx.requestId });
  res.headers.set("Set-Cookie", `${cookie}; ${csrfCookie}`);
  res.headers.set("X-CSRF-Token", csrfToken);
  return res;
});

// POST /api/auth/mfa/setup — Initie le setup MFA
router.post("/api/auth/mfa/setup", async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sid = parseCookie(cookieHeader, "sid");
  if (!sid) {
    return jsonErrorResponse({ code: "unauthorized", message: "Not authenticated", requestId: ctx.requestId }, 401);
  }
  const user = await auth.getSession(sid);
  if (!user) {
    return jsonErrorResponse({ code: "unauthorized", message: "Invalid session", requestId: ctx.requestId }, 401);
  }

  try {
    const setup = await auth.setupMfa(user.id);
    return jsonOk({ secret: setup.secret, qrCode: setup.qrCodeDataUri }, { requestId: ctx.requestId });
  } catch (err) {
    return jsonErrorResponse({ code: "mfa_error", message: (err as Error).message, requestId: ctx.requestId }, 400);
  }
});

// POST /api/auth/mfa/enable — Active MFA (vérifie le code TOTP)
router.post("/api/auth/mfa/enable", async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sid = parseCookie(cookieHeader, "sid");
  if (!sid) {
    return jsonErrorResponse({ code: "unauthorized", message: "Not authenticated", requestId: ctx.requestId }, 401);
  }
  const user = await auth.getSession(sid);
  if (!user) {
    return jsonErrorResponse({ code: "unauthorized", message: "Invalid session", requestId: ctx.requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonErrorResponse({ code: "invalid_body", message: "Invalid JSON body", requestId: ctx.requestId }, 400);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return jsonErrorResponse({ code: "validation_error", message: "TOTP code is required", requestId: ctx.requestId }, 400);
  }

  const result = await auth.enableMfa(user.id, code);
  if (!result.ok) {
    return jsonErrorResponse({ code: result.error!, message: "MFA activation failed", requestId: ctx.requestId }, 400);
  }

  return jsonOk({ enabled: true }, { requestId: ctx.requestId });
});

// POST /api/auth/mfa/disable — Désactive MFA
router.post("/api/auth/mfa/disable", async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sid = parseCookie(cookieHeader, "sid");
  if (!sid) {
    return jsonErrorResponse({ code: "unauthorized", message: "Not authenticated", requestId: ctx.requestId }, 401);
  }
  const user = await auth.getSession(sid);
  if (!user) {
    return jsonErrorResponse({ code: "unauthorized", message: "Invalid session", requestId: ctx.requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonErrorResponse({ code: "invalid_body", message: "Invalid JSON body", requestId: ctx.requestId }, 400);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return jsonErrorResponse({ code: "validation_error", message: "TOTP code is required", requestId: ctx.requestId }, 400);
  }

  const result = await auth.disableMfa(user.id, code);
  if (!result.ok) {
    return jsonErrorResponse({ code: result.error!, message: "MFA deactivation failed", requestId: ctx.requestId }, 400);
  }

  return jsonOk({ disabled: true }, { requestId: ctx.requestId });
});

// GET /api/auth/csrf — Génère un token CSRF (double-submit cookie)
router.get("/api/auth/csrf", async (_req, ctx) => {
  const csrfToken = auth.generateCsrfToken();
  const res = jsonOk({ csrfToken }, { requestId: ctx.requestId });
  res.headers.set("Set-Cookie", `csrf_token=${csrfToken}; Path=/; SameSite=Strict; Max-Age=${config.sessionExpiryHours * 3600}`);
  return res;
});

// ── Helper : parser un cookie par nom ────────────────────────────────────────

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

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
