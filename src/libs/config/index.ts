/**
 * Config — validation et sanitarisation des variables d'environnement.
 *
 * L'app lit `process.env` et l'injecte. Cette bibliothèque ne lit jamais
 * process.env, n'ouvre aucun port, et n'a aucun effet de bord à l'import.
 */

export { createConfig, parseUrl } from "./schema.ts";
