import { createHash } from "node:crypto";
import type { AdminRateLimitConfig, AdminRateLimitDeps, AdminRateLimitResult, BanInfo } from "./types.ts";

const BAN_PREFIX = "ban:";
const VIOLATIONS_PREFIX = "viol:";
const WINDOW_PREFIX = "rl:admin:";

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

  async function getViolations(ip: string): Promise<number> {
    const key = `${VIOLATIONS_PREFIX}${hashKey(ip)}`;
    const data = await redis.get(key);
    return data ? parseInt(data, 10) : 0;
  }

  async function incrementViolations(ip: string): Promise<number> {
    const key = `${VIOLATIONS_PREFIX}${hashKey(ip)}`;
    const count = await getViolations(ip) + 1;
    await redis.set(key, String(count), maxBanHours * 3600 * 2); // Double max ban duration TTL
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

  async function applyBan(ip: string, violations: number): Promise<void> {
    const banKey = `${BAN_PREFIX}${hashKey(ip)}`;
    const banDurationSeconds = calcBanDuration(violations) * 3600;
    const banUntil = Date.now() + banDurationSeconds * 1000;

    await redis.set(banKey, JSON.stringify({ violations, banUntil }), banDurationSeconds + 60);
  }

  async function check(ip: string, endpoint: string): Promise<AdminRateLimitResult> {
    const banInfo = await checkBan(ip);
    if (banInfo) {
      return { allowed: false, ban: banInfo };
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
      return { allowed: true, resetSeconds };
    }

    // Violation
    const violations = await incrementViolations(ip);
    await applyBan(ip, violations);
    await redis.del(windowKey);

    const newBanInfo = await checkBan(ip);
    return {
      allowed: false,
      ban: newBanInfo ?? { banned: true, retryAfterSeconds: windowSeconds, violations },
    };
  }

  async function clearBan(ip: string): Promise<void> {
    await redis.del(`${BAN_PREFIX}${hashKey(ip)}`);
  }

  return { check, clearBan };
}
