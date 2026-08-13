import type { AuthUser } from "./types.ts";
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_PREFIX = "session:";

/**
 * Store de sessions.
 *
 * Redis = store primaire (présence rapide O(1)).
 * DB = source de vérité (expiration + révocation).
 * token_hash = HMAC-SHA256(token, sessionSecret) : déterministe, permet le
 * lookup par token (logout / révocation) sans stocker le token en clair.
 *
 * Révocation : `revoked_at` au lieu de DELETE → l'audit est conservé.
 * Quand Redis tombe → session invalide (pas de fallback, plus sûr).
 */
export function createSessionStore(deps: {
  db: {
    queryOne: <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...params: unknown[]
    ) => Promise<T | null>;
    sql: {
      unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    };
  };
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    del(...keys: string[]): Promise<void>;
  };
}, config: { sessionSecret: string }) {
  const { db, redis } = deps;

  function hashToken(token: string): string {
    return createHmac("sha256", config.sessionSecret).update(token).digest("hex");
  }

  /**
   * Crée une session en DB + Redis.
   * Retourne le token opaque à mettre en cookie.
   */
  async function create(
    userId: string,
    token: string,
    expiryHours: number,
    meta: { ip?: string; userAgent?: string },
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + expiryHours * 3600_000);
    const tokenHash = hashToken(token);

    // DB : source de vérité + audit
    await db.sql.unsafe(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tokenHash, meta.ip ?? null, meta.userAgent ?? null, expiresAt.toISOString()],
    );

    // Redis : cache de présence (la validation finale est côté DB)
    await redis.set(`${SESSION_PREFIX}${token}`, userId);

    return token;
  }

  /**
   * Vérifie une session : Redis (présence) puis DB (expiration + révocation).
   */
  async function verify(token: string): Promise<AuthUser | null> {
    // 1. Redis — si absent, session inconnue
    const userId = await redis.get(`${SESSION_PREFIX}${token}`);
    if (!userId) return null;

    // 2. DB — token valide, non révoquée, non expirée
    const session = await db.queryOne<{ user_id: string }>`
      SELECT user_id
      FROM sessions
      WHERE token_hash = ${hashToken(token)}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `;

    if (!session) {
      // Expirée ou révoquée → nettoyer le cache
      await redis.del(`${SESSION_PREFIX}${token}`);
      return null;
    }

    // 3. Utilisateur actif
    const user = await db.queryOne<{
      id: string; email: string; first_name: string | null; last_name: string | null;
      mfa_enabled: boolean; status: string;
    }>`
      SELECT id, email, first_name, last_name, mfa_enabled, status
      FROM users WHERE id = ${session.user_id}::uuid AND deleted_at IS NULL
    `;

    if (!user || user.status !== "active") {
      await redis.del(`${SESSION_PREFIX}${token}`);
      return null;
    }

    // 4. Rôles
    const roles = await db.sql.unsafe<{ name: string }>(
      `SELECT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [session.user_id],
    );

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      roles: roles.map((r) => r.name),
      mfaEnabled: user.mfa_enabled,
    };
  }

  /**
   * Révoke une session (logout) — UPDATE, pas de suppression (audit conservé).
   */
  async function destroy(token: string): Promise<void> {
    await db.sql.unsafe(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)],
    );
    await redis.del(`${SESSION_PREFIX}${token}`);
  }

  /**
   * Révoke toutes les sessions d'un utilisateur (logout partout).
   */
  async function destroyAll(userId: string): Promise<void> {
    await db.sql.unsafe(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE user_id = $1::uuid AND revoked_at IS NULL`,
      [userId],
    );
    // Les clés Redis orphelines expireront / seront invalidées par la DB.
  }

  return { create, verify, destroy, destroyAll };
}

// ── CSRF (double-submit cookie) ──────────────────────────────────────────────

/**
 * Génère un token CSRF (cryptographiquement sûr).
 * Le cookie csrf_token est HttpOnly=false (le JS lit la valeur),
 * et X-CSRF-Token doit le reproduire exactement.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Vérifie que le token CSRF du header X-CSRF-Token correspond au cookie csrf_token.
 * Comparaison en temps constant (timingSafeEqual de node:crypto).
 */
export function verifyCsrfToken(cookieValue: string, headerValue: string): boolean {
  if (!cookieValue || !headerValue) return false;
  if (cookieValue.length !== headerValue.length) return false;

  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(cookieValue), enc.encode(headerValue));
}
