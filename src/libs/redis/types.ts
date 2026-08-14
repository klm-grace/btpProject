export interface RedisConfig {
  url: string;
  connectionTimeoutMs?: number;
}

export interface Redis {
  ping(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  close(): Promise<void>;
  client: RedisClientLike;
}
