/**
 * Db — client PostgreSQL via Bun.SQL.
 *
 * Injection de config (url), aucun process.env, aucun port, aucun effet de bord à l'import.
 */

export { createDb } from "./db.ts";
