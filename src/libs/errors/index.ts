/**
 * Errors — bibliothèque de gestion d'erreurs applicatives.
 *
 * Cette bibliothèque ne lit jamais `process.env`, n'ouvre aucun port et
 * n'a aucun effet de bord à l'import.
 */

export {
  AppError,
  HttpError,
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalError,
} from "./app-error.ts";
export { formatError } from "./format.ts";
export { errorToHttpStatus, isHttpError } from "./http.ts";
