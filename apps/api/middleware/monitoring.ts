/**
 * Middlewares pour apps/api.
 */

import type { Middleware } from "../types";
import { timingSafeEqual } from "@libs/http-security";

/**
 * Middleware de protection des endpoints de monitoring.
 * Vérifie la présence d'un token valide via le header X-Monitoring-Token.
 */
export const requireMonitoringAccess: Middleware = async (req, ctx, next) => {
  const token = req.headers.get("x-monitoring-token");
  const expected = ctx.app.config.monitoringToken;

  if (!token || !expected || !timingSafeEqual(token, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized monitoring access" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return next();
};
