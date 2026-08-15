/**
 * Pagination — Bibliothèque de keyset pagination avec token signé.
 *
 * Usage :
 * ```ts
 * import { createPagination } from "@libs/pagination";
 *
 * const { createCursor, decodeCursor, getNextCursor } = createPagination({
 *   secret: config.paginationSecret,
 *   pageSize: 20,
 * });
 *
 * // Générer un token
 * const cursor = getNextCursor(row);
 *
 * // Decoder un token
 * const decoded = decodeCursor(token);
 * ```
 */
export { createPagination } from "./pagination.ts";
export type { PaginationEngine } from "./engine.ts";
export type { CursorPayload, PaginationConfig, CursorDecodeError } from "./types.ts";
