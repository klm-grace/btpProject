import type { Redis, RedisConfig } from "./types.ts";

/**
 * Ouvre un client Redis via le constructeur natif `new RedisClient(url)`.
 * La configuration (url) est INJECTÉE : aucune lecture de process.env.
 */
export function createRedis(config: RedisConfig): Redis {
  const client = new Bun.RedisClient(config.url, {
    connectionTimeout: config.connectionTimeoutMs ?? 3000,
    autoReconnect: true,
    maxRetries: 3,
  }) as unknown as RedisClientLike;

  async function ping(): Promise<boolean> {
    try {
      if (!client.connected) {
        await client.connect();
      }
      const result = await client.ping();
      return result === "PONG" || result === "pong" || typeof result === "string";
    } catch {
      return false;
    }
  }

  async function get(key: string): Promise<string | null> {
    if (!client.connected) await client.connect();
    return client.get(key);
  }

  async function set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!client.connected) await client.connect();
    if (ttlSeconds !== undefined) {
      await (client as any).set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
  }

  async function del(...keys: string[]): Promise<void> {
    if (!client.connected) await client.connect();
    await client.del(...keys);
  }

  async function close(): Promise<void> {
    await client.close();
  }

  return {
    client,
    ping,
    get,
    set,
    del,
    close,
  };
}
