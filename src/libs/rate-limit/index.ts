/**
 * Rate Limiter — Bibliothèque de limitation de débit (sliding window).
 *
 * Protection contre brute-force, DoS, abus API.
 * Aucun process.env, aucun port, extraction possible.
 */

export { createRateLimiter, createRateLimitMiddleware } from "./rate-limiter.ts";
export type { RateLimitConfig, RateLimitDeps, RateLimitResult, RateLimitMiddlewareConfig } from "./rate-limiter.ts";