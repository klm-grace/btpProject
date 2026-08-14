/**
 * auth — Bibliothèque d'authentification réutilisable.
 *
 * Sessions opaques Redis (cache) + DB (source de vérité : expiration, révocation).
 * Pas de JWT, cookies HttpOnly/Secure/SameSite=Strict.
 * MFA TOTP (RFC 6238) obligatoire pour admin.
 * Protection brute-force via Redis.
 * CSRF : géré par la bibliothèque dédiée src/libs/csrf (double-submit cookie).
 *
 * Aucun process.env, aucune port, extraction possible.
 */

import type {
  AuthDeps, AuthConfig, AuthEngine,
  LoginResult, AuthUser, MfaSetupResult,
} from "./types.ts";
import { defaultHasher, generateToken } from "./password.ts";
import { createSessionStore } from "./session.ts";
import { createBruteForceStore } from "./brute-force.ts";
import { generateSecret, getOtpauthUri, verifyCode as totpVerify } from "./mfa.ts";

export type {
  AuthDeps, AuthConfig, AuthEngine,
  LoginResult, AuthUser, MfaSetupResult,
  PasswordHasher, SessionCookieOptions, CookieResult,
} from "./types.ts";

const PENDING_MFA_PREFIX = "pending_mfa:";
const MFA_SETUP_PREFIX = "mfa_setup:";
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$zS9kS6O+8X/k8T+v3X7f4w$XkS/L3Y7n+qP9zW1R4L2S3V4V5W6X7Y8Z9A0B1C2D3E";

/**
 * Crée le moteur d'authentification.
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
    const normalizedEmail = email.toLowerCase().trim();
    
    const bf = await bruteForce.check(normalizedEmail);
    if (bf.locked) {
      return { success: false, error: "brute_force_lockout" };
    }

    const user = await deps.db.queryOne<{
      id: string; email: string; password_hash: string; status: string;
      first_name: string | null; last_name: string | null; mfa_enabled: boolean;
    }>`
      SELECT id, email, password_hash, status, first_name, last_name, mfa_enabled
      FROM users WHERE email = ${normalizedEmail} AND deleted_at IS NULL
    `;

    const hashToVerify = user ? user.password_hash : DUMMY_HASH;
    const valid = await hasher.verify(password, hashToVerify);

    if (!user || user.status !== "active" || !valid) {
      await bruteForce.recordFailure(normalizedEmail);
      return { success: false, error: "invalid_credentials" };
    }

    if (user.mfa_enabled) {
      const pendingToken = tokenGen();
      await deps.redis.set(`${PENDING_MFA_PREFIX}${pendingToken}`, user.id, 900);
      return { success: false, error: "mfa_required", pendingToken };
    }

    // Rotation de session : invalider les anciennes sessions de l'utilisateur
    await sessions.destroyAll(user.id);

    const token = tokenGen();
    await sessions.create(user.id, token, config.sessionExpiryHours, meta ?? {});
    await bruteForce.reset(normalizedEmail);

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
    const userId = await deps.redis.get(`${PENDING_MFA_PREFIX}${pendingToken}`);
    if (!userId) {
      return { success: false, error: "invalid_credentials" };
    }

    const mfaBfKey = `bf_mfa:${pendingToken}`;
    const mfaAttempts = await deps.redis.get(mfaBfKey);
    const attempts = mfaAttempts ? parseInt(mfaAttempts, 10) + 1 : 1;

    if (attempts > 5) {
      await deps.redis.del(`${PENDING_MFA_PREFIX}${pendingToken}`);
      return { success: false, error: "too_many_mfa_attempts" };
    }

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

    const isValid = await totpVerify(user.mfa_secret, code, user.id, deps.redis);
    if (!isValid) {
      await deps.redis.set(mfaBfKey, String(attempts), 300);
      return { success: false, error: "invalid_credentials" };
    }

    await deps.redis.del(`${PENDING_MFA_PREFIX}${pendingToken}`);
    await deps.redis.del(mfaBfKey);

    // Rotation de session : invalider les anciennes sessions de l'utilisateur
    await sessions.destroyAll(user.id);

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

    await deps.redis.set(`${MFA_SETUP_PREFIX}${userId}`, secret, 900);

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

    return totpVerify(secret, code, userId, deps.redis);
  }

  async function enableMfa(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const setupSecret = await deps.redis.get(`${MFA_SETUP_PREFIX}${userId}`);
    if (!setupSecret) return { ok: false, error: "setup_not_initiated" };

    const valid = await totpVerify(setupSecret, code, userId, deps.redis);
    if (!valid) return { ok: false, error: "invalid_code" };

    await deps.db.sql.unsafe(
      `UPDATE users SET mfa_enabled = true, mfa_secret = $1, updated_at = NOW() WHERE id = $2::uuid`,
      [setupSecret, userId],
    );

    await deps.redis.del(`${MFA_SETUP_PREFIX}${userId}`);

    return { ok: true };
  }

  async function disableMfa(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const user = await deps.db.queryOne<{ mfa_secret: string | null; mfa_enabled: boolean }>`
      SELECT mfa_secret, mfa_enabled FROM users WHERE id = ${userId}::uuid
    `;
    if (!user?.mfa_enabled) return { ok: false, error: "mfa_not_enabled" };
    if (!user.mfa_secret) return { ok: false, error: "mfa_not_enabled" };

    const valid = await totpVerify(user.mfa_secret, code, userId, deps.redis);
    if (!valid) return { ok: false, error: "invalid_code" };

    await deps.db.sql.unsafe(
      `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW() WHERE id = $1::uuid`,
      [userId],
    );

    return { ok: true };
  }

  // ── Destroy All Sessions (token rotation) ──────────────────────────────

  async function destroyAllSessions(userId: string): Promise<void> {
    await sessions.destroyAll(userId);
  }

  return {
    login,
    completeMfaLogin,
    logout,
    getSession,
    changePassword,
    destroyAllSessions,
    setupMfa,
    verifyMfa,
    enableMfa,
    disableMfa,
  };
}

export { generateSecret, getOtpauthUri, verifyCode as verifyTotpCode } from "./mfa.ts";
