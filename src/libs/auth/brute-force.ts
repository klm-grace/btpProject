/**
 * Protection brute-force basée sur Redis.
 * 
 * - Utilise des clés hashées (SHA-256) pour éviter le DoS mémoire et les injections de clés.
 * - TTL strict pour éviter les verrouillages permanents.
 */

import { createHash } from "node:crypto";

const PREFIX = "bf:";

export interface BruteForceConfig {
  maxAttempts: number;
  lockoutHours: number;
}

export function createBruteForceStore(deps: {
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
  };
}, config: BruteForceConfig) {
  const { redis } = deps;

  /**
   * Hashe l'email pour créer une clé Redis uniforme et sécurisée.
   */
  function hashKey(email: string): string {
    return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
  }

  /**
   * Vérifie si l'email est en lockout.
   */
  async function check(email: string): Promise<{ locked: boolean; retryAfterSeconds?: number }> {
    const key = `${PREFIX}${hashKey(email)}`;
    const count = await redis.get(key);
    if (!count) return { locked: false };

    const attempts = parseInt(count, 10);
    if (isNaN(attempts) || attempts < config.maxAttempts) return { locked: false };

    return {
      locked: true,
      retryAfterSeconds: config.lockoutHours * 3600,
    };
  }

  /**
   * Enregistre une tentative échouée.
   * Applique un TTL dès le premier échec pour éviter la fuite mémoire,
   * et un TTL de lockout quand le seuil est atteint.
   */
  async function recordFailure(email: string): Promise<void> {
    const key = `${PREFIX}${hashKey(email)}`;
    const count = await redis.get(key);
    const attempts = count ? parseInt(count, 10) + 1 : 1;

    const ttl = attempts >= config.maxAttempts 
      ? config.lockoutHours * 3600 
      : 3600; // TTL court pour les tentatives simples (1h)

    await redis.set(key, String(attempts), ttl);
  }

  /**
   * Réinitialise le compteur après un login réussi.
   */
  async function reset(email: string): Promise<void> {
    await redis.del(`${PREFIX}${hashKey(email)}`);
  }

  return { check, recordFailure, reset };
}
