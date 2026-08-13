/**
 * Http — helpers de réponse HTTP JSON standardisée.
 *
 * Injection pure : aucune dépendance d'environnement. Aucun port.
 */

export type { JsonOkOptions, JsonErrorDetails } from "./http.ts";
export { jsonOk, jsonErrorResponse, jsonPaginated } from "./http.ts";
