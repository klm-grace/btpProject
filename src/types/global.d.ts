/**
 * Types globaux du backend — disponibles partout sans import.
 *
 * IMPORTANT : ne contient AUCUNE valeur runtime, uniquement des types.
 * Ne jamais importer ces types ; ils sont disponibles via `declare global`.
 */

declare global {
  // ---------------------------------------------------------------------------
  // Logger
  // ---------------------------------------------------------------------------

  type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

  interface LogEntry {
    level: LogLevel;
    message: string;
    time: string;
    fields?: Record<string, unknown>;
  }

  type LogSink = (entry: LogEntry) => void;

  interface Logger {
    trace(message: string, fields?: Record<string, unknown>): void;
    debug(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
    child(fields: Record<string, unknown>): Logger;
  }

  interface LoggerConfig {
    level: LogLevel;
    sink?: LogSink;
    defaultSink?: LogSink;
    baseFields?: Record<string, unknown>;
    /** true = sortie formatée couleur (terminal) ; false/absent = JSON brut (production). */
    formatted?: boolean;
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  interface AppErrorOptions {
    requestId?: string;
    context?: Record<string, unknown>;
    code?: string;
    cause?: unknown;
  }

  interface AppErrorFields {
    readonly name: string;
    readonly message: string;
    readonly code: string;
    readonly requestId?: string;
    readonly context?: Record<string, unknown>;
    readonly cause?: unknown;
  }

  interface ErrorShape {
    error: {
      code: string;
      message: string;
      requestId?: string;
      details?: Record<string, unknown>;
    };
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  type RawEnv = Record<string, string | undefined>;

  interface AppConfig {
    env: "development" | "test" | "production";
    server: {
      host: string;
      port: number;
    };
    log: {
      level: LogLevel;
      formatted: boolean;
    };
    db: {
      url: string;
    };
    redis: {
      url: string;
    };
    /** Liste blanche d'origines CORS (séparées par virgules dans l'env). */
    corsOrigins: string[];
    /** true si derrière un reverse proxy (X-Forwarded-For). */
    trustProxy: boolean;
    /** Token secret pour les endpoints de monitoring (health détaillé). Vide = accès bloqué. */
    monitoringToken: string;
    /** true = logger formaté couleur (terminal) ; false = JSON brut (production). */
    logFormatted: boolean;
    /** Secret pour générer les tokens de session. Requis en prod. */
    sessionSecret: string;
    /** Durée de vie de la session en heures. */
    sessionExpiryHours: number;
    /** Nom de l'issuer dans les QR codes TOTP. */
    mfaIssuer: string;
    /** Tentatives max avant lockout (brute-force). */
    bruteForceMaxAttempts: number;
    /** Durée du lockout en heures. */
    bruteForceLockoutHours: number;
    /** TTL du cache permissions RBAC en minutes. */
    rbacCacheTtlMinutes: number;
    /** Max requêtes publiques autorisées par fenêtre (par IP). */
    publicRateLimitMax: number;
    /** Fenêtre du rate limit public en secondes. */
    publicRateLimitWindow: number;
    /** Version actuelle du consentement RGPD. */
    consentVersion: string;
    // ── Storage / Upload (section 09) ────────────────────────────────────────
    storage: {
      backend: "disk" | "r2";
      diskPath: string;
      diskMaxBytes: number;
      maxFileSizeBytes: number;
      maxStorageBytes: number;
      allowedMimeTypes: string[];
      imageMaxWidth: number;
      imageMaxHeight: number;
      variantSizes: number[];
    };
  }

  interface EnvSchemaResult<TOutput = AppConfig> {
    parse(raw: RawEnv): TOutput;
    validate(raw: RawEnv): { ok: true; data: TOutput } | { ok: false; error: unknown };
  }

  // ---------------------------------------------------------------------------
  // Database
  // ---------------------------------------------------------------------------

  interface DbConfig {
    url: string;
    connectTimeoutMs?: number;
  }

  /**
   * Interface minimale du client SQL (Bun.SQL).
   * Le client réel est callable (tagged template) : sql`SELECT 1`.
   */
  interface SqlClientLike {
    <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...params: unknown[]
    ): Promise<T[]>;
    /** Exécute du SQL brut (pas de paramètres bindés dans les strings). */
    unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    /** Démarre une transaction. Le callback reçoit un client SQL scope. */
    begin<T>(fn: (tx: SqlClientLike) => Promise<T>): Promise<T>;
    close(options?: { timeout?: number }): Promise<void>;
    end(options?: { timeout?: number }): Promise<void>;
    connect(): Promise<SqlClientLike>;
  }

  interface Db {
    readonly sql: SqlClientLike;
    readonly ping: () => Promise<boolean>;
    readonly queryOne: <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...params: unknown[]
    ) => Promise<T | null>;
    readonly close: () => Promise<void>;
  }

  // ---------------------------------------------------------------------------
  // Redis
  // ---------------------------------------------------------------------------

  interface RedisConfig {
    url: string;
    connectionTimeoutMs?: number;
  }

  interface RedisClientLike {
    readonly connected: boolean;
    connect(): Promise<void>;
    close(): void | Promise<void>;
    ping(): Promise<string>;
    set(key: string, value: string): Promise<unknown>;
    set(key: string, value: string, ttlType: "EX", ttlSeconds: number): Promise<unknown>;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<unknown>;
  }

  interface Redis {
    readonly client: RedisClientLike;
    readonly ping: () => Promise<boolean>;
    readonly get: (key: string) => Promise<string | null>;
    readonly set: (key: string, value: string) => Promise<void>;
    readonly del: (...keys: string[]) => Promise<void>;
    readonly close: () => Promise<void>;
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  type HealthStatus = "ok" | "degraded" | "down";

  interface DependencyHealth {
    name: string;
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
  }

  interface HealthReport {
    status: HealthStatus;
    uptime: number;
    timestamp: string;
    dependencies: DependencyHealth[];
  }

  interface HealthChecker {
    check(): Promise<HealthReport>;
  }

  interface HealthCheckerDeps {
    db?: { ping: () => Promise<boolean> };
    redis?: { ping: () => Promise<boolean> };
  }
}

export {};
