/**
 * Redis — client Redis via Bun.RedisClient.
 *
 * Injection de config (url), aucun process.env, aucun port, aucun effet de bord à l'import.
 */

export { createRedis } from "./redis.ts";
