export interface AdminRateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  baseBanHours: number;
  maxBanHours: number;
  keyPrefix?: string;
}

export interface AdminRateLimitDeps {
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
  };
}

export interface BanInfo {
  banned: boolean;
  retryAfterSeconds: number;
  violations: number;
}

export interface AdminRateLimitResult {
  allowed: boolean;
  resetSeconds?: number;
  ban?: BanInfo;
}
