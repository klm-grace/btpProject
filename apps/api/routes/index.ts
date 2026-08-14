/**
 * Configuration des routes de l'API.
 */

import type { Router } from "@libs/router";
import type { AppContext } from "../types";
import { handleHealth, handleReady } from "../handlers/health";
import { handleLogin, handleLogout } from "../handlers/auth";
import { handleMfaVerify, handleMfaSetup } from "../handlers/mfa";
import { sessionMiddleware } from "../middleware/session";
import { requireMonitoringAccess } from "../middleware/monitoring";

export function registerRoutes(router: Router, ctx: AppContext) {
  // On cast les handlers en 'any' pour éviter le conflit de type RouteContext
  // car le router attend un RouteContext de @libs/router et non celui de apps/api.

  // --- Health ---
  router.get("/api/health", requireMonitoringAccess as any, handleHealth as any);
  router.get("/api/ready", handleReady as any);

  // --- Auth (avec rate-limit strict) ---
  router.post("/api/auth/login", ctx.authRateLimitMiddleware as any, handleLogin as any);
  router.post("/api/auth/logout", ctx.authRateLimitMiddleware as any, handleLogout as any);

  // --- MFA (avec rate-limit strict) ---
  router.post("/api/auth/mfa/setup", ctx.authRateLimitMiddleware as any, sessionMiddleware as any, handleMfaSetup as any);
  router.post("/api/auth/mfa/verify", ctx.authRateLimitMiddleware as any, handleMfaVerify as any);
}
