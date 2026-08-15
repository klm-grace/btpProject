import { z } from "zod";

const logLevels = {
  trace: "trace",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
} as const;

const environments = {
  development: "development",
  test: "test",
  production: "production",
} as const;

const envSchema = z.object({
  app: z
    .enum(environments, { message: "NODE_ENV invalide (development|test|production)" })
    .default("development"),
  port: z.coerce.number().int().min(1).max(65535).default(4000),
  host: z.string().min(1).default("127.0.0.1"),
  logLevel: z
    .enum(logLevels, { message: "LOG_LEVEL invalide (trace|debug|info|warn|error)" })
    .default("info"),
  databaseUrl: z.string().url().min(1, "DATABASE_URL est requis"),
  redisUrl: z.string().url().min(1, "REDIS_URL est requis"),
  corsOrigins: z.string().default("http://localhost:3000"),
  trustProxy: z
    .enum(["true", "false"], { message: "TRUST_PROXY doit être true ou false" })
    .default("false"),
  monitoringToken: z.string().default(""),
  logFormatted: z
    .enum(["true", "false"], { message: "LOG_FORMATTED doit être true ou false" })
    .default("false"),
  sessionSecret: z.string().default(""),
  sessionExpiryHours: z.coerce.number().int().min(1).max(720).default(24),
  mfaIssuer: z.string().default("BTP Project"),
  bruteForceMaxAttempts: z.coerce.number().int().min(1).max(100).default(5),
  bruteForceLockoutHours: z.coerce.number().int().min(1).max(48).default(1),
  rbacCacheTtlMinutes: z.coerce.number().int().min(0).max(1440).default(5),
  publicRateLimitMax: z.coerce.number().int().min(1).max(100).default(5),
  publicRateLimitWindow: z.coerce.number().int().min(10).max(3600).default(300),
  consentVersion: z.string().default("1.0"),
  // ── Storage / Upload (section 09) ─────────────────────────────────────
  storageBackend: z.enum(["disk", "r2"]).default("disk"),
  storageDiskPath: z.string().default("./data/uploads"),
  storageDiskMaxBytes: z.coerce.number().int().min(1).default(20 * 1024 * 1024 * 1024),
  storageR2Endpoint: z.string().default(""),
  storageR2Bucket: z.string().default("btp-media"),
  storageR2AccessKeyId: z.string().default(""),
  storageR2SecretAccessKey: z.string().default(""),
  maxFileSizeBytes: z.coerce.number().int().min(1).default(10 * 1024 * 1024),
  allowedMimeTypes: z.string().default("image/jpeg,image/png,image/webp,image/gif"),
  imageMaxWidth: z.coerce.number().int().min(1).default(1920),
  imageMaxHeight: z.coerce.number().int().min(1).default(1080),
  variantSizes: z.string().default("150,600"),
}).refine(
  (data) => data.app !== "production" || data.sessionSecret.length >= 32,
  {
    message: "SESSION_SECRET est requis en production (32 caractères min, générer avec: openssl rand -hex 32)",
    path: ["sessionSecret"],
  },
);

type ParsedConfig = {
  app: "development" | "test" | "production";
  port: number;
  host: string;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  redisUrl: string;
  corsOrigins: string;
  trustProxy: "true" | "false";
  monitoringToken: string;
  logFormatted: "true" | "false";
  sessionSecret: string;
  sessionExpiryHours: number;
  mfaIssuer: string;
  bruteForceMaxAttempts: number;
  bruteForceLockoutHours: number;
  rbacCacheTtlMinutes: number;
  publicRateLimitMax: number;
  publicRateLimitWindow: number;
  consentVersion: string;
  // ── Storage / Upload (section 09) ─────────────────────────────────────
  storageBackend: "disk" | "r2";
  storageDiskPath: string;
  storageDiskMaxBytes: number;
  storageR2Endpoint: string;
  storageR2Bucket: string;
  storageR2AccessKeyId: string;
  storageR2SecretAccessKey: string;
  maxFileSizeBytes: number;
  allowedMimeTypes: string;
  imageMaxWidth: number;
  imageMaxHeight: number;
  variantSizes: string;
};

function toConfig(parsed: ParsedConfig): AppConfig {
  return {
    env: parsed.app,
    server: { host: parsed.host, port: parsed.port },
    log: { level: parsed.logLevel, formatted: parsed.logFormatted === "true" },
    db: { url: parsed.databaseUrl },
    redis: { url: parsed.redisUrl },
    corsOrigins: parsed.corsOrigins.split(",").map((o) => o.trim()).filter(Boolean),
    trustProxy: parsed.trustProxy === "true",
    monitoringToken: parsed.monitoringToken,
    logFormatted: parsed.logFormatted === "true",
    sessionSecret: parsed.sessionSecret,
    sessionExpiryHours: parsed.sessionExpiryHours,
    mfaIssuer: parsed.mfaIssuer,
    bruteForceMaxAttempts: parsed.bruteForceMaxAttempts,
    bruteForceLockoutHours: parsed.bruteForceLockoutHours,
    rbacCacheTtlMinutes: parsed.rbacCacheTtlMinutes,
    publicRateLimitMax: parsed.publicRateLimitMax,
    publicRateLimitWindow: parsed.publicRateLimitWindow,
    consentVersion: parsed.consentVersion,
    storage: {
      backend: parsed.storageBackend,
      diskPath: parsed.storageDiskPath,
      diskMaxBytes: parsed.storageDiskMaxBytes,
      maxFileSizeBytes: parsed.maxFileSizeBytes,
      allowedMimeTypes: parsed.allowedMimeTypes.split(",").map((m) => m.trim()).filter(Boolean),
      imageMaxWidth: parsed.imageMaxWidth,
      imageMaxHeight: parsed.imageMaxHeight,
      variantSizes: parsed.variantSizes.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0),
    },
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
        corsOrigins: raw.CORS_ORIGINS,
        trustProxy: raw.TRUST_PROXY,
        monitoringToken: raw.MONITORING_TOKEN,
        logFormatted: raw.LOG_FORMATTED,
        sessionSecret: raw.SESSION_SECRET,
        sessionExpiryHours: raw.SESSION_EXPIRY_HOURS,
        mfaIssuer: raw.MFA_ISSUER,
        bruteForceMaxAttempts: raw.BRUTE_FORCE_MAX_ATTEMPTS,
        bruteForceLockoutHours: raw.BRUTE_FORCE_LOCKOUT_HOURS,
        rbacCacheTtlMinutes: raw.RBAC_CACHE_TTL_MINUTES,
        publicRateLimitMax: raw.PUBLIC_RATE_LIMIT_MAX,
        publicRateLimitWindow: raw.PUBLIC_RATE_LIMIT_WINDOW,
        consentVersion: raw.CONSENT_VERSION,
        // ── Storage / Upload (section 09) ───────────────────────────────
        storageBackend: raw.STORAGE_BACKEND,
        storageDiskPath: raw.STORAGE_DISK_PATH,
        storageDiskMaxBytes: raw.STORAGE_DISK_MAX_BYTES,
        storageR2Endpoint: raw.STORAGE_R2_ENDPOINT,
        storageR2Bucket: raw.STORAGE_R2_BUCKET,
        storageR2AccessKeyId: raw.STORAGE_R2_ACCESS_KEY_ID,
        storageR2SecretAccessKey: raw.STORAGE_R2_SECRET_ACCESS_KEY,
        maxFileSizeBytes: raw.MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: raw.ALLOWED_MIME_TYPES,
        imageMaxWidth: raw.IMAGE_MAX_WIDTH,
        imageMaxHeight: raw.IMAGE_MAX_HEIGHT,
        variantSizes: raw.VARIANT_SIZES,
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
