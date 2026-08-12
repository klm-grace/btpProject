import { AppError } from "./app-error.ts";
import { HttpError } from "./app-error.ts";

/** Renvoie le statut HTTP associé à une erreur. */
export function errorToHttpStatus(err: unknown): number {
  if (err instanceof HttpError) return err.status;
  if (err instanceof AppError) return 400; // défaut applicatif
  return 500;
}

/** Type guard : est-ce une erreur HTTP typée ? */
export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}