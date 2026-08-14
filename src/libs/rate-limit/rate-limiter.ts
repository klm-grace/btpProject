/**
 * Rate Limiter — Bibliothèque de limitation de débit (sliding window).
 *
 * Protection contre brute-force, DoS, abus API.
 * Aucun process.env, aucun port, extraction possible.
 */

import type { Middleware } from "@libs/router/types";

export interface RateLimitConfig {
  /** Nombre max de requêtes dans la fenêtre. */
  maxRequests: number;
  /** Fenêtre de temps en secondes. */
  windowSeconds: number;
  /** Préfixe de clé Redis (défaut: "rl:"). */
  keyPrefix?: string;
}

export interface RateLimitDeps {
  /** Client Redis avec get/set/del. */
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
  };
}

export interface RateLimitResult {
  /** true si la requête est autorisée. */
  allowed: boolean;
  /** Requêtes restantes dans la fenêtre. */
  remaining: number;
  /** Temps avant reset en secondes. */
  resetSeconds: number;
  /** Total max autorisé. */
  limit: number;
}

/**
 * Crée un rate limiter (sliding window log).
 */
export function createRateLimiter(deps: RateLimitDeps, config: RateLimitConfig) {
  const { redis } = deps;
  const { maxRequests, windowSeconds, keyPrefix = "rl:" } = config;

  async function check(key: string): Promise<RateLimitResult> {
    const fullKey = `${keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    // Récupère les timestamps existants
    const data = await redis.get(fullKey);
    let timestamps: number[] = data ? JSON.parse(data) : [];

    // Filtre les timestamps dans la fenêtre
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const allowed = timestamps.length < maxRequests;
    let remaining = Math.max(0, maxRequests - timestamps.length);
    let resetSeconds = windowSeconds;

    if (allowed) {
      timestamps.push(now);
      remaining = Math.max(0, maxRequests - timestamps.length);
    }

    // Calcule le temps avant reset (plus ancien timestamp dans la fenêtre)
    if (timestamps.length > 0) {
      const oldest = timestamps[0]!; // Assert non-null car length > 0
      resetSeconds = Math.ceil((oldest + windowSeconds * 1000 - now) / 1000);
    }

    // Sauvegarde avec TTL = fenêtre + marge
    await redis.set(fullKey, JSON.stringify(timestamps), windowSeconds + 60);

    return { allowed, remaining, resetSeconds: Math.max(1, resetSeconds), limit: maxRequests };
  }

  async function reset(key: string): Promise<void> {
    await redis.del(`${keyPrefix}${key}`);
  }

  return { check, reset };
}

export interface RateLimitMiddlewareConfig {
  /** Fonction pour extraire la clé (ex: IP, userId, IP+endpoint). */
  keyGenerator: (req: Request, ctx: any) => string;
  /** Message d'erreur personnalisé. */
  message?: string;
  /** Code d'erreur. */
  errorCode?: string;
}

export function createRateLimitMiddleware(
  rateLimiter: ReturnType<typeof createRateLimiter>,
  config: RateLimitMiddlewareConfig
): Middleware {
  const { keyGenerator, message = "Too Many Requests", errorCode = "RATE_LIMIT_EXCEEDED" } = config;

  return async (req: Request, ctx: any, next: () => Promise<Response>) => {
    const key = keyGenerator(req, ctx);
    const result = await rateLimiter.check(key);

    // Headers standard RateLimit
    const headers = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetSeconds),
    };

    if (!result.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: { code: errorCode, message } }),
        { 
          status: 429, 
          headers: { 
            "Content-Type": "application/json",
            ...headers,
            "Retry-After": String(result.resetSeconds),
          } 
        }
      );
    }

    const res = await next();
    
    // Ajoute les headers sur la réponse
    for (const [k, v] of Object.entries(headers)) {
      res.headers.set(k, v);
    }
    
    return res;
  };
}