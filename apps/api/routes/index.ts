/**
 * Configuration des routes de l'API.
 */

import type { Router } from "@libs/router";
import type { AppContext } from "../types";
import { handleHealth, handleReady } from "../handlers/health";
import { handleLogin, handleLogout, handleGetMe, handleChangePassword, handleGetCsrf } from "../handlers/auth";
import { handleMfaVerify, handleMfaSetup } from "../handlers/mfa";
import { handleContactSubmit, handleQuoteSubmit } from "../handlers/public";
import { handleMediaUpload } from "../handlers/media";
import { sessionMiddleware } from "../middleware/session";
import { requireMonitoringAccess } from "../middleware/monitoring";
import { wrapHandler, wrapMiddleware } from "../utils/wrap";

export function registerRoutes(router: Router, ctx: AppContext) {
  // ── CSRF middleware global (toutes les mutations protégées) ───────────
  router.use(ctx.csrf.middleware);

  // --- Health ---
  router.get("/api/health", wrapMiddleware(requireMonitoringAccess), wrapHandler(handleHealth));
  router.get("/api/ready", wrapHandler(handleReady));

  // --- Auth (avec rate-limit strict) ---
  router.post("/api/auth/login", wrapMiddleware(ctx.authRateLimitMiddleware), wrapHandler(handleLogin));
  router.post("/api/auth/logout", wrapMiddleware(ctx.authRateLimitMiddleware), wrapHandler(handleLogout));
  router.get("/api/auth/csrf", wrapHandler(handleGetCsrf));
  router.get("/api/auth/me", wrapMiddleware(ctx.authRateLimitMiddleware), wrapMiddleware(sessionMiddleware), wrapHandler(handleGetMe));
  router.post("/api/auth/change-password", wrapMiddleware(ctx.authRateLimitMiddleware), wrapMiddleware(sessionMiddleware), wrapHandler(handleChangePassword));

  // --- MFA (avec rate-limit strict) ---
  router.post("/api/auth/mfa/setup", wrapMiddleware(ctx.authRateLimitMiddleware), wrapMiddleware(sessionMiddleware), wrapHandler(handleMfaSetup));
  router.post("/api/auth/mfa/verify", wrapMiddleware(ctx.authRateLimitMiddleware), wrapHandler(handleMfaVerify));

  // --- Formulaires publics (sans CSRF, rate-limit IP) ---
  router.post("/api/public/contact", wrapMiddleware(ctx.publicRateLimitMiddleware), wrapHandler(handleContactSubmit));
  router.post("/api/public/quote", wrapMiddleware(ctx.publicRateLimitMiddleware), wrapHandler(handleQuoteSubmit));

  // --- Médias (upload, protégé session) ---
  router.post(
    "/api/media",
    wrapMiddleware(ctx.authRateLimitMiddleware),
    wrapMiddleware(sessionMiddleware),
    wrapHandler(handleMediaUpload),
  );
}