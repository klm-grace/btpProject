/** Helpers de réponse HTTP JSON standardisée. */
export interface JsonOkOptions {
  status?: number;
  requestId?: string;
  /** Métadonnées additionnelles (ex. pagination). */
  meta?: Record<string, unknown>;
}

export interface JsonErrorDetails {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/** Réponse JSON réussie : { success: true, data, requestId?, meta? } */
export function jsonOk<T>(data: T, options: JsonOkOptions = {}): Response {
  const { status = 200, requestId, meta } = options;
  const body: Record<string, unknown> = { success: true, data };
  if (requestId) body.requestId = requestId;
  if (meta) body.meta = meta;
  return Response.json(body, { status });
}

/** Réponse JSON d'erreur : { success: false, error: { code, message, requestId?, details? } } */
export function jsonErrorResponse(details: JsonErrorDetails, status = 400): Response {
  const error: Record<string, unknown> = { code: details.code, message: details.message };
  if (details.requestId) error.requestId = details.requestId;
  if (details.details && Object.keys(details.details).length > 0) error.details = details.details;
  return Response.json({ success: false, error }, { status });
}

/** Réponse paginée : { success: true, data: T[], meta: { page, pageSize, total, totalPages } } */
export function jsonPaginated<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  options: JsonOkOptions = {},
): Response {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return jsonOk(data, {
    ...options,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      ...(options.meta ?? {}),
    },
  });
}
