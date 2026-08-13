import type { PasswordHasher } from "./types.ts";

/**
 * Hasher par défaut : Bun.password (argon2id, paramètres OWASP).
 *
 * - hash : Bun.password.hash() avec argon2id
 * - verify : Bun.password.verify()
 *
 * Ne lit aucun env, n'ouvre aucun port.
 */
export const defaultHasher: PasswordHasher = {
  async hash(password: string): Promise<string> {
    return Bun.password.hash(password, "argon2id");
  },

  async verify(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(password, hash);
  },
};

/**
 * Génère un token opaque cryptographiquement sûr (hex, 32 octets = 64 hex chars).
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
