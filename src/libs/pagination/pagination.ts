/**
 * Pagination — Keyset (cursor-based) pagination avec token signé HMAC.
 *
 * Principe :
 * - Le client envoie un token (cursor) qui encode la dernière ligne vue.
 * - Le serveur decode le token, vérifie la signature, et fait :
 *   WHERE (created_at, id) < (cursor.value, cursor.id)
 *     ORDER BY created_at DESC, id DESC
 *     LIMIT pageSize + 1
 * - Si le résultat a plus de pageSize lignes, on retourne un nextCursor.
 *
 * Avantages :
 * - Performance constante quelle que soit la page
 * - Pas de drift (rows supprimées/ajoutées ne déplacent pas les résultats)
 * - Token signé = impossible de falsifier le cursor
 */

import { createHmac, randomBytes } from "node:crypto";
import type { CursorPayload, PaginationConfig, CursorDecodeError } from "./types.ts";

const PREFIX = "cursor_";
const SALT_LENGTH = 16;

function signHmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function createPagination(config: PaginationConfig) {
  const secret = config.secret;
  const pageSize = config.pageSize ?? 20;

  /**
   * Génère un token signé pour une page suivante.
   */
  function createCursor(payload: CursorPayload): string {
    const salt = randomBytes(SALT_LENGTH).toString("hex");
    const data = `${PREFIX}${salt}|${payload.value}|${payload.id}`;
    return `${data}.${signHmac(secret, data)}`;
  }

  /**
   * Decode et vérifie un token cursor.
   */
  function decodeCursor(token: string): CursorPayload | CursorDecodeError {
    if (!token?.startsWith(PREFIX)) {
      return { code: "INVALID_CURSOR", message: "Cursor invalide" };
    }
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < PREFIX.length) {
      return { code: "INVALID_CURSOR", message: "Cursor invalide" };
    }
    const data = token.slice(0, dotIdx);
    const signature = token.slice(dotIdx + 1);

    // Vérif signature
    const expectedSig = signHmac(secret, data);
    if (signature.length !== expectedSig.length) {
      return { code: "INVALID_CURSOR", message: "Signature invalide" };
    }
    // Timing-safe comparison
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (result !== 0) {
      return { code: "INVALID_CURSOR", message: "Signature invalide" };
    }

    const parts = data.slice(PREFIX.length).split("|");
    if (parts.length !== 3) {
      return { code: "INVALID_CURSOR", message: "Cursor mal formé" };
    }
    return { value: parts[1]!, id: parts[2]! };
  }

  /**
   * Génère le cursor pour la page suivante à partir d'une ligne.
   */
  function getNextCursor(row: { created_at: string | Date; id: string }): string | null {
    const value = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
    return createCursor({ value, id: row.id });
  }

  /**
   * Génère les instructions SQL pour une requête keyset.
   * Utilise PostgreSQL : (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC
   */
  function buildQuery(cursor: CursorPayload | null, limit: number): { sql: string; params: unknown[] } {
    const effectiveLimit = limit || pageSize;
    if (!cursor) {
      return {
        sql: `SELECT * FROM __TABLE__ ORDER BY created_at DESC, id DESC LIMIT $1`,
        params: [effectiveLimit],
      };
    }
    return {
      sql: `SELECT * FROM __TABLE__
            WHERE (created_at, id) < ($1, $2)
            ORDER BY created_at DESC, id DESC
            LIMIT $3`,
      params: [cursor.value, cursor.id, effectiveLimit + 1],
    };
  }

  return { createCursor, decodeCursor, getNextCursor, buildQuery, pageSize, signHmac };
}
