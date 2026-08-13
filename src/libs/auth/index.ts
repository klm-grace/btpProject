/**
 * auth — Bibliothèque d'authentification réutilisable.
 *
 * Sessions opaques Redis (cache) + DB (source de vérité : expiration, révocation).
 * Pas de JWT, cookies HttpOnly/Secure/SameSite=Strict.
 * MFA TOTP (RFC 6238) obligatoire pour admin.
 * Protection brute-force via Redis.
 * CSRF : double-submit cookie (cookie HttpOnly=false + header X-CSRF-Token).
 *
 * Aucun process.env, aucune port, extraction possible.
 */

import type {
  AuthDeps, AuthConfig, AuthEngine,
  LoginResult, AuthUser, MfaSetupResult,
} from "./types.ts";
import { defaultHasher, generateToken } from "./password.ts";
import { createSessionStore, generateCsrfToken, verifyCsrfToken } from "./session.ts";
import { createBruteForceStore } from "./brute-force.ts";
import { generateSecret, getOtpauthUri, verifyCode as totpVerify } from "./mfa.ts";

export type {
  AuthDeps, AuthConfig, AuthEngine,
  LoginResult, AuthUser, MfaSetupResult,
  PasswordHasher, SessionCookieOptions, CookieResult,
} from "./types.ts";

const PENDING_MFA_PREFIX = "pending_mfa:";
const MFA_SETUP_PREFIX = "mfa_setup:";

/**
 * Crée le moteur d'authentification.
 *
 * Usage dans l'app :
 * ```ts
 * const auth = createAuth({ db, redis }, { sessionSecret, sessionExpiryHours: 24, ... });
 * const result = await auth.login(email, password, { ip, userAgent });
 * ```
 */
export function createAuth(deps: AuthDeps, config: AuthConfig): AuthEngine {
  const hasher = deps.hasher ?? defaultHasher;
  const tokenGen = deps.tokenGenerator ?? generateToken;
  const sessions = createSessionStore(
    { db: deps.db, redis: deps.redis },
    { sessionSecret: config.sessionSecret },
  );
  const bruteForce = createBruteForceStore(
    { redis: deps.redis },
    { maxAttempts: config.bruteForceMaxAttempts, lockoutHours: config.bruteForceLockoutHours },
  );

  async function getUserRoles(userId: string): Promise<string[]> {
    const roles = await deps.db.sql.unsafe<{ name: string }>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [userId],
    );
    return roles.map((r) => r.name);
  }

  // ── Login ──────────────────────────────────────────────────────────────

  async function login(
    email: string,
    password: string,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    // 1. Brute-force check
    const bf = await bruteForce.check(email);
    if (bf.locked) {
      return { success: false, error: "brute_force_lockout" };
    }

    // 2. Lookup utilisateur (message générique — pas d'énumération)
    const user = await deps.db.queryOne<{
      id: string; email: string; password_hash: string; status: string;
      first_name: string | null; last_name: string | null; mfa_enabled: boolean;
    }>`
      SELECT id, email, password_hash, status, first_name, last_name, mfa_enabled
      FROM users WHERE email = ${email.toLowerCase()} AND deleted_at IS NULL
    `;

    if (!user || user.status !== "active") {
      await bruteForce.recordFailure(email);
      return { success: false, error: "invalid_credentials" };
    }

    // 3. Vérification du mot de passe
    const valid = await hasher.verify(password, user.password_hash);
    if (!valid) {
      await bruteForce.recordFailure(email);
      return { success: false, error: "invalid_credentials" };
    }

    // 4. Si MFA activé → pré-session (pendingToken) à valider avec le code TOTP
    if (user.mfa_enabled) {
      const pendingToken = tokenGen();
      await deps.redis.set(`${PENDING_MFA_PREFIX}${pendingToken}`, user.id);
      return { success: false, error: "mfa_required", pendingToken };
    }

    // 5. Créer la session
    const token = tokenGen();
    await sessions.create(user.id, token, config.sessionExpiryHours, meta ?? {});

    // 6. Réinitialiser le compteur brute-force
    await bruteForce.reset(email);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: await getUserRoles(user.id),
        mfaEnabled: user.mfa_enabled,
      },
    };
  }

  // ── Login MFA (2e étape) ────────────────────────────────────────────────

  async function completeMfaLogin(
    pendingToken: string,
    code: string,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    // 1. Valider la pré-session
    const userId = await deps.redis.get(`${PENDING_MFA_PREFIX}${pendingToken}`);
    if (!userId) {
      return { success: false, error: "invalid_credentials" };
    }

    // 2. Récupérer le secret TOTP en DB
    const user = await deps.db.queryOne<{
      id: string; email: string; status: string;
      first_name: string | null; last_name: string | null;
      mfa_enabled: boolean; mfa_secret: string | null;
    }>`
      SELECT id, email, status, first_name, last_name, mfa_enabled, mfa_secret
      FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL
    `;

    if (!user || user.status !== "active" || !user.mfa_enabled || !user.mfa_secret) {
      await deps.redis.del(`${PENDING_MFA_PREFIX}${pendingToken}`);
      return { success: false, error: "invalid_credentials" };
    }

    // 3. Vérifier le code TOTP
    if (!totpVerify(user.mfa_secret, code)) {
      return { success: false, error: "invalid_credentials" };
    }

    // 4. Consommer la pré-session
    await deps.redis.del(`${PENDING_MFA_PREFIX}${pendingToken}`);

    // 5. Créer la vraie session
    const token = tokenGen();
    await sessions.create(user.id, token, config.sessionExpiryHours, meta ?? {});

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: await getUserRoles(user.id),
        mfaEnabled: true,
      },
    };
  }

  // ── Logout ─────────────────────────────────────────────────────────────

  async function logout(sessionToken: string): Promise<void> {
    await sessions.destroy(sessionToken);
  }

  // ── Get Session ────────────────────────────────────────────────────────

  async function getSession(sessionToken: string): Promise<AuthUser | null> {
    return sessions.verify(sessionToken);
  }

  // ── Change Password ────────────────────────────────────────────────────

  async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const user = await deps.db.queryOne<{ password_hash: string }>`
      SELECT password_hash FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL
    `;
    if (!user) return { ok: false, error: "user_not_found" };

    const valid = await hasher.verify(currentPassword, user.password_hash);
    if (!valid) return { ok: false, error: "invalid_current_password" };

    const newHash = await hasher.hash(newPassword);
    await deps.db.sql.unsafe(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`,
      [newHash, userId],
    );

    // Invalider toutes les sessions (sécurité)
    await sessions.destroyAll(userId);

    return { ok: true };
  }

  // ── MFA ────────────────────────────────────────────────────────────────

  async function setupMfa(userId: string): Promise<MfaSetupResult> {
    const user = await deps.db.queryOne<{ email: string; mfa_enabled: boolean }>`
      SELECT email, mfa_enabled FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL
    `;
    if (!user) throw new Error("user_not_found");
    if (user.mfa_enabled) throw new Error("mfa_already_enabled");

    const secret = generateSecret();
    const otpauthUri = getOtpauthUri(secret, user.email, config.mfaIssuer);

    // Stocker le secret temporairement en Redis (pas encore activé)
    await deps.redis.set(`${MFA_SETUP_PREFIX}${userId}`, secret);

    // QR code data URI (service externe gratuit, pas de dépendance npm)
    const qrCodeDataUri =
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`;

    return { secret, otpauthUri, qrCodeDataUri };
  }

  async function verifyMfa(userId: string, code: string): Promise<boolean> {
    const activeSecret = await deps.db.queryOne<{ mfa_secret: string | null }>`
      SELECT mfa_secret FROM users WHERE id = ${userId}::uuid
    `;
    const setupSecret = await deps.redis.get(`${MFA_SETUP_PREFIX}${userId}`);

    const secret = activeSecret?.mfa_secret ?? setupSecret;
    if (!secret) return false;

    return totpVerify(secret, code);
  }

  async function enableMfa(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const setupSecret = await deps.redis.get(`${MFA_SETUP_PREFIX}${userId}`);
    if (!setupSecret) return { ok: false, error: "setup_not_initiated" };

    const valid = totpVerify(setupSecret, code);
    if (!valid) return { ok: false, error: "invalid_code" };

    // Activer MFA sur le compte
    await deps.db.sql.unsafe(
      `UPDATE users SET mfa_enabled = true, mfa_secret = $1, updated_at = NOW() WHERE id = $2::uuid`,
      [setupSecret, userId],
    );

    // Nettoyer le secret temporaire
    await deps.redis.del(`${MFA_SETUP_PREFIX}${userId}`);

    return { ok: true };
  }

  async function disableMfa(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const user = await deps.db.queryOne<{ mfa_secret: string | null; mfa_enabled: boolean }>`
      SELECT mfa_secret, mfa_enabled FROM users WHERE id = ${userId}::uuid
    `;
    if (!user?.mfa_enabled) return { ok: false, error: "mfa_not_enabled" };
    if (!user.mfa_secret) return { ok: false, error: "mfa_not_enabled" };

    const valid = totpVerify(user.mfa_secret, code);
    if (!valid) return { ok: false, error: "invalid_code" };

    await deps.db.sql.unsafe(
      `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW() WHERE id = $1::uuid`,
      [userId],
    );

    return { ok: true };
  }

  // ── CSRF ───────────────────────────────────────────────────────────────

  return {
    login,
    completeMfaLogin,
    logout,
    getSession,
    changePassword,
    setupMfa,
    verifyMfa,
    enableMfa,
    disableMfa,
    generateCsrfToken,
    verifyCsrfToken,
  };
}

export { generateCsrfToken, verifyCsrfToken } from "./session.ts";
export { generateSecret, getOtpauthUri, verifyCode as verifyTotpCode } from "./mfa.ts";
