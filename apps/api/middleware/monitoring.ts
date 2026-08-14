/**
 * Middleware de monitoring — protège les endpoints santé (health) par token.
 */

import type { Middleware } from "../types";
import { jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";

/**
 * Middleware qui exige un token de monitoring valide.
 * Le token est passé dans le header `X-Monitoring-Token`.
 * Si le token est absent ou incorrect → 403.
 */
export const requireMonitoringAccess: Middleware = async (req, ctx, next) => {
  const app = getAppContext(ctx);
  const providedToken = req.headers.get("x-monitoring-token");

  if (!app.config.monitoringToken) {
    return jsonErrorResponse({ message: "Monitoring endpoint disabled", code: "MONITORING_DISABLED" }, 403);
  }

  if (!providedToken || providedToken !== app.config.monitoringToken) {
    return jsonErrorResponse({ message: "Invalid or missing monitoring token", code: "INVALID_TOKEN" }, 403);
  }

  return next();
};