/**
 * csrf — Bibliothèque de protection CSRF (double-submit cookie).
 *
 * Token généré côté serveur, stocké en cookie HttpOnly=false.
 * Vérifié via header X-CSRF-Token (comparaison en temps constant).
 * Middleware intégré pour le routeur.
 *
 * Aucun process.env, aucun port, extraction possible.
 */

export type { Csrf, CsrfConfig } from "./types.ts";
export { createCsrf } from "./csrf.ts";
