/**
 * Handlers pour les endpoints de santé (Health) de apps/api.
 */

import type { RouteContext, RouteHandler } from "../types";
import { jsonOk } from "@libs/http";

/**
 * GET /api/health
 * Vérifie l'état complet des dépendances (DB, Redis).
 */
export const handleHealth: RouteHandler = async (req, ctx) => {
  const result = await ctx.app.health.check();
  const status = result.status === "ok" ? 200 : result.status === "down" ? 503 : 200;

  return jsonOk(result, { status });
};

/**
 * GET /api/ready
 * Vérification rapide pour Kubernetes/LoadBalancer.
 */
export const handleReady: RouteHandler = async (req, ctx) => {
  return jsonOk({ status: "ready" });
};
