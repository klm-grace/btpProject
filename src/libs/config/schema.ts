import { z } from "zod";

const logLevels = ["trace", "debug", "info", "warn", "error"] as const;
const environments = ["development", "test", "production"] as const;

const envSchema = z.object({
  app: z
    .enum(environments, {
      errorMap: () => ({ message: "NODE_ENV invalide (development|test|production)" }),
    })
    .default("development"),
  port: z.coerce.number().int().min(1).max(65535).default(4000),
  host: z.string().min(1).default("127.0.0.1"),
  logLevel: z
    .enum(logLevels, {
      errorMap: () => ({ message: "LOG_LEVEL invalide (trace|debug|info|warn|error)" }),
    })
    .default("info"),
  databaseUrl: z.string().url().min(1, "DATABASE_URL est requis"),
  redisUrl: z.string().url().min(1, "REDIS_URL est requis"),
});

function toConfig(parsed: z.infer<typeof envSchema>): AppConfig {
  return {
    env: parsed.app,
    server: { host: parsed.host, port: parsed.port },
    log: { level: parsed.logLevel },
    db: { url: parsed.databaseUrl },
    redis: { url: parsed.redisUrl },
  };
}

/**
 * Construit le lecteur de configuration applicative.
 *
 * Purement fonctionnel et injecté : on lui passe un objet d'environnement
 * (l'app lit `process.env`, PAS cette bibliothèque).
 */
export function createConfig(): EnvSchemaResult<AppConfig> {
  return {
    parse(raw: RawEnv): AppConfig {
      const parsed = envSchema.parse({
        app: raw.NODE_ENV,
        port: raw.PORT,
        host: raw.HOST,
        logLevel: raw.LOG_LEVEL,
        databaseUrl: raw.DATABASE_URL,
        redisUrl: raw.REDIS_URL,
      });
      return toConfig(parsed);
    },
    validate(raw: RawEnv) {
      try {
        return { ok: true as const, data: this.parse(raw) };
      } catch (error) {
        return { ok: false as const, error };
      }
    },
  };
}

/** Parse une URL sans mise en réseau. */
export function parseUrl(raw: string): URL {
  return new URL(raw);
}
