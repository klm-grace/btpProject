/**
 * PaginationEngine — Interface du moteur de pagination.
 */
import type { CursorPayload, CursorDecodeError } from "./types.ts";

export interface PaginationEngine {
  createCursor(payload: CursorPayload): string;
  decodeCursor(token: string): CursorPayload | CursorDecodeError;
  getNextCursor(row: { created_at: string | Date; id: string }): string | null;
  buildQuery(cursor: CursorPayload | null, limit: number): { sql: string; params: unknown[] };
  readonly pageSize: number;
}
