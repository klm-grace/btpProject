import { AppError } from "./app-error.ts";
import { errorToHttpStatus } from "./http.ts";

/**
 * Formate une erreur pour une réponse HTTP JSON sûre.
 * N'expose JAMAIS le stack ni la cause technique brute (SQL, réseau...).
 */
export function formatError(
  err: unknown,
  requestId?: string,
): ErrorShape & { status: number } {
  if (err instanceof AppError) {
    return {
      status: errorToHttpStatus(err),
      error: {
        code: err.code,
        message: err.message,
        requestId: err.requestId ?? requestId,
        ...(err.context && Object.keys(err.context).length > 0
          ? { details: err.context }
          : {}),
      },
    };
  }

  return {
    status: 500,
    error: {
      code: "internal_error",
      message: "Internal server error",
      requestId,
    },
  };
}
