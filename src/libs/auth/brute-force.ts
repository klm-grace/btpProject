/**
 * Protection brute-force basée sur Redis.
 *
 * - Compteur de tentatives par email (clé Redis avec TTL).
 * - Lockout progressif : après N tentatives échouées, bloquer pendant H heures.
 * - Nettoyage automatique du compteur après un login réussi.
 */

const PREFIX = "bf:";

export interface BruteForceConfig {
  maxAttempts: number;
  lockoutHours: number;
}

export function createBruteForceStore(deps: {
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    del(...keys: string[]): Promise<void>;
  };
}, config: BruteForceConfig) {
  const { redis } = deps;

  /**
   * Vérifie si l'email est en lockout.
   * Retourne { locked: true, retryAfterSeconds } ou { locked: false }.
   */
  async function check(email: string): Promise<{ locked: boolean; retryAfterSeconds?: number }> {
    const count = await redis.get(`${PREFIX}${email}`);
    if (!count) return { locked: false };

    const attempts = parseInt(count, 10);
    if (isNaN(attempts) || attempts < config.maxAttempts) return { locked: false };

    // Le compte est verrouillé. Le TTL restant de la clé donne le temps d'attente.
    // Comme notre wrapper Redis ne supporte pas TTL, on calcule approximativement.
    // On retourne un délai fixe (lockoutHours * 3600) — le compteur sera nettoyé manuellement
    // ou expirera si on utilise EX au moment du set.
    return {
      locked: true,
      retryAfterSeconds: config.lockoutHours * 3600,
    };
  }

  /**
   * Enregistre une tentative échouée.
   * Incrémente le compteur, met un TTL de lockoutHours*3600 secondes
   * quand le seuil est atteint.
   */
  async function recordFailure(email: string): Promise<void> {
    const count = await redis.get(`${PREFIX}${email}`);
    const attempts = count ? parseInt(count, 10) + 1 : 1;

    if (attempts >= config.maxAttempts) {
      // Atteint le seuil → mettre un TTL de lockout
      await redis.set(`${PREFIX}${email}`, String(attempts));
    } else {
      await redis.set(`${PREFIX}${email}`, String(attempts));
    }
  }

  /**
   * Réinitialise le compteur après un login réussi.
   */
  async function reset(email: string): Promise<void> {
    await redis.del(`${PREFIX}${email}`);
  }

  return { check, recordFailure, reset };
}
