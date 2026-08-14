/**
 * Handlers pour les endpoints de health/ready de apps/api.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";

/**
 * GET /api/health
 * Endpoint de santé détaillé (protégé par monitoring token).
 */
export const handleHealth: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const result = await app.health.check();
    return jsonOk({ data: result });
  } catch (e: unknown) {
    app.log.error("Health check error", { error: e });
    return jsonErrorResponse({ message: "Health check failed", code: "HEALTH_ERROR" }, 500);
  }
};

/**
 * GET /api/ready
 * Endpoint de readiness (simple, public).
 */
export const handleReady: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  return jsonOk({ success: true, timestamp: new Date().toISOString() });
};