import { createHash } from "node:crypto";
import type { AdminRateLimitConfig, AdminRateLimitDeps, AdminRateLimitResult, BanInfo } from "./types.ts";

const BAN_PREFIX = "ban:";
const VIOLATIONS_PREFIX = "viol:";
const USER_VIOLATIONS_PREFIX = "uviol:";
const WINDOW_PREFIX = "rl:admin:";
const BAN_LOG_PREFIX = "banlog:";

function hashKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 16);
}

export function createAdminRateLimiter(deps: AdminRateLimitDeps, config: AdminRateLimitConfig) {
  const { redis } = deps;
  const { maxRequests, windowSeconds, baseBanHours, maxBanHours, keyPrefix = WINDOW_PREFIX } = config;

  function calcBanDuration(violations: number): number {
    const duration = Math.min(baseBanHours * Math.pow(2, violations - 1), maxBanHours);
    return Math.max(duration, baseBanHours);
  }

  // ── IP-based tracking ──────────────────────────────────────────────────────

  async function getViolations(ip: string): Promise<number> {
    const key = `${VIOLATIONS_PREFIX}${hashKey(ip)}`;
    const data = await redis.get(key);
    return data ? parseInt(data, 10) : 0;
  }

  async function incrementViolations(ip: string): Promise<number> {
    const key = `${VIOLATIONS_PREFIX}${hashKey(ip)}`;
    const count = await getViolations(ip) + 1;
    await redis.set(key, String(count), maxBanHours * 3600 * 2);
    return count;
  }

  async function checkBan(ip: string): Promise<BanInfo | null> {
    const key = `${BAN_PREFIX}${hashKey(ip)}`;
    const data = await redis.get(key);
    if (!data) return null;

    try {
      const state = JSON.parse(data) as { violations: number; banUntil: number };
      const now = Date.now();
      if (state.banUntil <= now) {
        await redis.del(key);
        return null;
      }
      return {
        banned: true,
        retryAfterSeconds: Math.ceil((state.banUntil - now) / 1000),
        violations: state.violations,
      };
    } catch {
      await redis.del(key);
      return null;
    }
  }

  async function applyBan(ip: string, violations: number, userId?: string): Promise<void> {
    const banKey = `${BAN_PREFIX}${hashKey(ip)}`;
    const banDurationSeconds = calcBanDuration(violations) * 3600;
    const banUntil = Date.now() + banDurationSeconds * 1000;

    await redis.set(banKey, JSON.stringify({ violations, banUntil, userId }), banDurationSeconds + 60);

    // Log the ban for audit trail
    await redis.set(
      `${BAN_LOG_PREFIX}${hashKey(ip, String(violations))}`,
      JSON.stringify({ ip: hashKey(ip), userId, violations: String(violations), banUntil, bannedAt: Date.now() }),
      maxBanHours * 3600 * 2,
    );
  }

  // ── User-based tracking ────────────────────────────────────────────────────

  async function getUserViolations(userId: string): Promise<number> {
    const key = `${USER_VIOLATIONS_PREFIX}${userId}`;
    const data = await redis.get(key);
    return data ? parseInt(data, 10) : 0;
  }

  async function incrementUserViolations(userId: string): Promise<number> {
    const key = `${USER_VIOLATIONS_PREFIX}${userId}`;
    const count = await getUserViolations(userId) + 1;
    await redis.set(key, String(count), maxBanHours * 3600 * 2);
    return count;
  }

  async function checkUserBan(userId: string): Promise<BanInfo | null> {
    const key = `${BAN_PREFIX}user:${userId}`;
    const data = await redis.get(key);
    if (!data) return null;

    try {
      const state = JSON.parse(data) as { violations: number; banUntil: number };
      const now = Date.now();
      if (state.banUntil <= now) {
        await redis.del(key);
        return null;
      }
      return {
        banned: true,
        retryAfterSeconds: Math.ceil((state.banUntil - now) / 1000),
        violations: state.violations,
      };
    } catch {
      await redis.del(key);
      return null;
    }
  }

  async function applyUserBan(userId: string, violations: number): Promise<void> {
    const banKey = `${BAN_PREFIX}user:${userId}`;
    const banDurationSeconds = calcBanDuration(violations) * 3600;
    const banUntil = Date.now() + banDurationSeconds * 1000;

    await redis.set(banKey, JSON.stringify({ violations, banUntil }), banDurationSeconds + 60);
  }

  // ── Main check ─────────────────────────────────────────────────────────────

  async function check(ip: string, endpoint: string, userId?: string): Promise<AdminRateLimitResult> {
    // Check IP ban first
    const banInfo = await checkBan(ip);
    if (banInfo) {
      return { allowed: false, ban: banInfo };
    }

    // Check user ban if provided
    if (userId) {
      const userBanInfo = await checkUserBan(userId);
      if (userBanInfo) {
        return { allowed: false, ban: userBanInfo };
      }
    }

    const windowKey = `${keyPrefix}${hashKey(ip, endpoint)}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const data = await redis.get(windowKey);
    let timestamps: number[] = data ? JSON.parse(data) : [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const allowed = timestamps.length < maxRequests;
    const resetSeconds = timestamps.length > 0
      ? Math.ceil((timestamps[0]! + windowSeconds * 1000 - now) / 1000)
      : windowSeconds;

    if (allowed) {
      timestamps.push(now);
      await redis.set(windowKey, JSON.stringify(timestamps), windowSeconds + 60);
      return { allowed: true, resetSeconds, remaining: maxRequests - timestamps.length, limit: maxRequests };
    }

    // Violation — ban IP
    const violations = await incrementViolations(ip);
    await applyBan(ip, violations, userId);

    // Also track user violations if userId provided
    if (userId) {
      const userViolations = await incrementUserViolations(userId);
      if (userViolations >= 3) {
        await applyUserBan(userId, userViolations);
      }
    }

    await redis.del(windowKey);

    const newBanInfo = await checkBan(ip);
    return {
      allowed: false,
      ban: newBanInfo ?? { banned: true, retryAfterSeconds: windowSeconds, violations },
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  async function clearBan(ip: string): Promise<void> {
    await redis.del(`${BAN_PREFIX}${hashKey(ip)}`);
  }

  async function clearUserBan(userId: string): Promise<void> {
    await redis.del(`${BAN_PREFIX}user:${userId}`);
  }

  async function cleanupExpiredBans(): Promise<number> {
    // Scan for expired bans and remove them
    // Note: Redis doesn't have scan by pattern in all versions, so we use a simpler approach
    // The TTL on ban keys handles automatic cleanup
    return 0;
  }

  // ── Audit trail ────────────────────────────────────────────────────────────

  async function getBanHistory(limit: number = 20): Promise<Array<{
    ip: string;
    userId: string | null;
    violations: number;
    bannedAt: string;
    banUntil: string;
  }>> {
    const results: Array<{ ip: string; userId: string | null; violations: number; bannedAt: string; banUntil: string }> = [];
    // Scan for ban log entries (in production, use a proper DB table)
    // For now, return empty — the ban keys in Redis serve as the trail
    return results;
  }

  return { check, clearBan, clearUserBan, cleanupExpiredBans, getBanHistory };
}
