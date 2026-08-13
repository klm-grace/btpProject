/**
 * Migrations — bibliothèque de gestion de migrations SQL versionnées.
 *
 * Lit les fichiers SQL dans un dossier, les applique en ordre, et enregistre
 * chaque migration exécutée dans la table `_migrations`.
 *
 * Injection : `db` et `logger` (optionnel). Aucun process.env, aucun port.
 */

export { createMigrations } from "./migrations.ts";
export { loadSqlFiles } from "./loader.ts";
