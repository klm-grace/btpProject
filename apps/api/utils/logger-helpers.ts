/**
 * Helpers de logging pour les handlers.
 * Centralise les patterns de logging sécurisés.
 */

import type { Logger } from "../../../src/types/global";

/**
 * Log une tentative de connexion avec sécurité.
 */
export function logLoginAttempt(
  log: Logger,
  email: string,
  success: boolean,
  ip: string | null,
  reason?: string,
): void {
  const meta: Record<string, unknown> = { success, ip };
  if (!success && reason) meta.reason = reason;
  // Ne pas logger l'email en clair pour les échecs (PII)
  log[success ? "info" : "security"](
    success ? "Login success" : "Login failed",
    meta,
  );
}

/**
 * Log une tentative d'accès non autorisé.
 */
export function logForbiddenAccess(
  log: Logger,
  userId: string | undefined,
  resource: string,
  ip: string | null,
  reason?: string,
): void {
  log.security("Forbidden access attempt", {
    userId,
    resource,
    ip,
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log une erreur de validation d'entrée.
 */
export function logValidationError(
  log: Logger,
  endpoint: string,
  error: string,
  ip: string | null,
): void {
  log.warn("Validation error", { endpoint, error, ip });
}

/**
 * Log une opération CRUD.
 */
export function logCrudOperation(
  log: Logger,
  operation: "create" | "update" | "delete",
  entity: string,
  entityId: string,
  userId: string,
  ip?: string | null,
): void {
  log.info(`${operation === "create" ? "Created" : operation === "update" ? "Updated" : "Deleted"} ${entity}`, {
    userId,
    entityId,
    ip,
    operation,
  });
}

/**
 * Log une tentative d'intrusion détectée.
 */
export function logIntrusionAttempt(
  log: Logger,
  type: "sql_injection" | "xss" | "path_traversal" | "brute_force" | "invalid_uuid",
  ip: string | null,
  endpoint: string,
  detail?: string,
): void {
  log.security("Intrusion attempt detected", {
    type,
    ip,
    endpoint,
    detail,
    timestamp: new Date().toISOString(),
  });
}
