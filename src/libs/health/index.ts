/**
 * Health — agrégateur d'état de santé des dépendances.
 *
 * Injection de deps (db, redis), aucun process.env, aucun port, aucun effet de bord à l'import.
 */

export { createHealthChecker } from "./health.ts";
