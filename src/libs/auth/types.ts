// ── Types publics ────────────────────────────────────────────────────────────

import type { Redis } from "@libs/redis";

/** Dépendances injectées par l'app (pas de process.env). */
export interface AuthDeps {
  /** Client DB (table users, sessions). */
  db: {
    queryOne: <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...params: unknown[]
    ) => Promise<T | null>;
    sql: {
      unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    };
  };
  /** Client Redis (sessions actives + brute-force). */
  redis: Redis;
  /** Optionnel : injecter un hasher personnalisé (défaut : Bun.password). */
  hasher?: PasswordHasher;
  /** Optionnel : injecter un générateur de token (défaut : crypto random). */
  tokenGenerator?: () => string;
}


/** Interface du hasher de mots de passe. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** Config injectée par l'app. */
export interface AuthConfig {
  /** Secret pour HMAC des tokens de session. Requis en prod. */
  sessionSecret: string;
  /** Durée de vie de la session en heures. */
  sessionExpiryHours: number;
  /** Nom de l'issuer TOTP. */
  mfaIssuer: string;
  /** Tentatives max avant lockout brute-force. */
  bruteForceMaxAttempts: number;
  /** Durée du lockout en heures. */
  bruteForceLockoutHours: number;
}

/** Résultat d'un login. */
export type LoginResult =
  | { success: true; token: string; user: AuthUser }
  | {
      success: false;
      error: "invalid_credentials" | "account_disabled" | "brute_force_lockout" | "mfa_required" | "too_many_mfa_attempts";
      /** Présent quand error === "mfa_required" : pré-session à valider avec le code TOTP. */
      pendingToken?: string;
    };

/** Utilisateur renvoyé par l'auth. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  mfaEnabled: boolean;
}

/** Résultat de setup MFA. */
export interface MfaSetupResult {
  /** Secret TOTP (pour backup). */
  secret: string;
  /** URI otpauth:// pour le QR code. */
  otpauthUri: string;
  /** QR code en base64 data URI (prêt à afficher). */
  qrCodeDataUri: string;
}

/** Options de cookie de session. */
export interface SessionCookieOptions {
  /** Nom du cookie (défaut : "sid"). */
  name?: string;
  /** Durée max de vie du cookie en secondes. */
  maxAgeSeconds: number;
}

/** Résultat du build du cookie Set-Cookie. */
export interface CookieResult {
  header: string;
  options: SessionCookieOptions;
}

// ── Interface du moteur d'auth retourné par createAuth ───────────────────────

export interface AuthEngine {
  login(email: string, password: string, meta?: { ip?: string; userAgent?: string }): Promise<LoginResult>;
  /** Valide une pré-session MFA (login avec TOTP) et crée la vraie session. */
  completeMfaLogin(pendingToken: string, code: string, meta?: { ip?: string; userAgent?: string }): Promise<LoginResult>;
  logout(sessionToken: string): Promise<void>;
  getSession(sessionToken: string): Promise<AuthUser | null>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }>;
  setupMfa(userId: string): Promise<MfaSetupResult>;
  verifyMfa(userId: string, code: string): Promise<boolean>;
  enableMfa(userId: string, code: string): Promise<{ ok: boolean; error?: string }>;
  disableMfa(userId: string, code: string): Promise<{ ok: boolean; error?: string }>;
}
