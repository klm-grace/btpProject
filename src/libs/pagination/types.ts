/**
 * Pagination — Keyset (cursor-based) pagination avec token signé.
 */

export interface CursorPayload {
  /** Valeur de la colonne de tri (ex: created_at, updated_at) */
  value: string;
  /** UUID ou ID unique pour briser les égalités */
  id: string;
}

export interface PaginationConfig {
  /** Secret cryptographique pour signer les tokens */
  secret: string;
  /** Taille par défaut des pages */
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorDecodeError {
  code: string;
  message: string;
}
