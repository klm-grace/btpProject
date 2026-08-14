/**
 * Utilitaires de traçabilité (Request-ID) pour apps/api.
 */

import { randomUUID } from "node:crypto";

/**
 * Génère ou récupère un Request-ID pour le traçage.
 */
export function getRequestId(req: Request): string {
  const header = req.headers.get("x-request-id");
  return header || randomUUID();
}

/**
 * Ajoute l'ID de requête aux headers de réponse pour le debugging.
 */
export function addRequestIdHeader(res: Response, requestId: string): Response {
  res.headers.set("x-request-id", requestId);
  return res;
}
