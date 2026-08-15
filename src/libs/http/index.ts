/**
 * Http — Helpers de réponse HTTP JSON standardisée.
 *
 * Injection pure : aucune dépendance d'environnement. Aucun port.
 */

export type { JsonOptions, JsonOkOptions, JsonErrorDetails, JsonStreamOptions } from "./http.ts";
export { json, jsonOk, jsonError, jsonErrorResponse, jsonPaginated, jsonStream, text, html, htmlEscape, htmlSanitize, xml, notFound, send } from "./http.ts";
