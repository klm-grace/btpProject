import {
  mkdir,
  readdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream, type WriteStream } from "node:fs";

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

// ── Couleurs ANSI ────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  black: "\x1b[30m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgGreen: "\x1b[42m",
  bgCyan: "\x1b[46m",
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  trace: C.gray,
  debug: C.cyan,
  info: C.green,
  warn: C.yellow,
  error: C.red,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

// ── Clés sensibles (redaction automatique) ───────────────────────────────────

const SENSITIVE_KEYS = new Set([
  "password", "passwd", "pwd", "token", "access_token", "refresh_token",
  "session_token", "secret", "client_secret", "authorization", "cookie",
  "set-cookie", "mfa_code", "mfa_token", "mfa_secret", "totp", "api_key",
  "apikey", "private_key", "password_hash", "sid", "csrf_token",
  "session_id", "recovery_code", "otp", "otp_code", "mfa_setup_secret",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: redact(value.stack, depth + 1) } : {}),
    };
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    out[key] = SENSITIVE_KEYS.has(lower) ? "[REDACTED]" : redact(val, depth + 1);
  }
  return out;
}

// ── Sinks console ────────────────────────────────────────────────────────────

function jsonSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function formatField(key: string, value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return `${C.gray}${key}${C.reset}=${C.dim}null${C.reset}`;
  if (typeof value === "string") return `${C.cyan}${key}${C.reset}=${C.white}${value}${C.reset}`;
  if (typeof value === "number") return `${C.cyan}${key}${C.reset}=${C.magenta}${String(value)}${C.reset}`;
  if (typeof value === "boolean") return `${C.cyan}${key}${C.reset}=${C.yellow}${String(value)}${C.reset}`;
  return `${C.cyan}${key}${C.reset}=${C.white}${JSON.stringify(value)}${C.reset}`;
}

/** Badge de niveau coloré (fond + texte). */
function levelBadge(level: LogLevel): string {
  const label = LEVEL_LABEL[level];
  switch (level) {
    case "error":
      return `${C.bgRed}${C.white}${C.bold} ${label} ${C.reset}`;
    case "warn":
      return `${C.bgYellow}${C.black}${C.bold} ${label} ${C.reset}`;
    case "info":
      return `${C.bgGreen}${C.black}${C.bold} ${label} ${C.reset}`;
    case "debug":
      return `${C.bgCyan}${C.black}${C.bold} ${label} ${C.reset}`;
    default:
      return `${C.gray} ${label} ${C.reset}`;
  }
}

/** Couleur du status HTTP selon la classe. */
function statusColor(status: number): string {
  if (status >= 500) return C.bgRed + C.white + C.bold;
  if (status >= 400) return C.bgYellow + C.black + C.bold;
  if (status >= 300) return C.cyan + C.bold;
  return C.bgGreen + C.black + C.bold;
}

/** Couleur d'une méthode HTTP. */
function methodColor(method: string): string {
  switch (method) {
    case "GET": return `${C.cyan}${C.bold}`;
    case "POST": return `${C.green}${C.bold}`;
    case "PUT": return `${C.yellow}${C.bold}`;
    case "PATCH": return `${C.magenta}${C.bold}`;
    case "DELETE": return `${C.red}${C.bold}`;
    default: return `${C.white}${C.bold}`;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${C.magenta}${(ms * 1000).toFixed(0)}µs${C.reset}`;
  if (ms < 1000) return `${C.magenta}${ms.toFixed(1)}ms${C.reset}`;
  return `${C.magenta}${(ms / 1000).toFixed(2)}s${C.reset}`;
}

/** Affiche les champs restants (hors ceux déjà rendus en tête). */
function formatExtraFields(fields: Record<string, unknown>, exclude: string[]): string {
  const entries = Object.entries(fields).filter(([k]) => !exclude.includes(k));
  if (entries.length === 0) return "";
  return "  " + entries.map(([k, v]) => formatField(k, v)).join("  ");
}

/** Ligne dédiée aux requêtes HTTP (message "HTTP request"). */
function formatHttpRequest(fields: Record<string, unknown>): string {
  const method = String(fields.method ?? "?");
  const path = String(fields.path ?? "?");
  const query = fields.query ? String(fields.query) : "";
  const status = typeof fields.status === "number" ? fields.status : Number(fields.status ?? 0);
  const durationMs = typeof fields.durationMs === "number" ? fields.durationMs : Number(fields.durationMs ?? 0);
  const requestId = fields.requestId ? String(fields.requestId).slice(0, 8) : "";

  const statusText = status > 0
    ? `${statusColor(status)} ${status} ${C.reset}`
    : "";
  const queryText = query && query !== "?" ? ` ${C.dim}${query}${C.reset}` : "";
  const reqText = requestId ? ` ${C.gray}req=${requestId}${C.reset}` : "";

  return [
    `${methodColor(method)}${method.padEnd(6)}${C.reset}`,
    `${C.white}${C.bold}${path}${C.reset}${queryText}`,
    statusText.trim(),
    formatDuration(durationMs),
    reqText.trim(),
  ].filter(Boolean).join(" ");
}

function formattedSink(entry: LogEntry): void {
  const time = new Date(entry.time).toISOString().slice(11, 23);
  const badge = levelBadge(entry.level);
  const fields = entry.fields ?? {};

  let line: string;
  if (entry.message === "HTTP request") {
    line = `${C.gray}${time}${C.reset} ${badge} ${formatHttpRequest(fields)}`;
    const extra = formatExtraFields(fields, ["method", "path", "query", "status", "durationMs", "requestId", "service"]);
    if (extra) line += extra;
  } else {
    const service = fields.service ? `${C.cyan}${C.bold}${fields.service}${C.reset}  ` : "";
    const extra = formatExtraFields(fields, ["service"]);
    line = `${C.gray}${time}${C.reset} ${badge}  ${service}${C.white}${C.bold}${entry.message}${C.reset}${extra}`;
  }

  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ── Loki transport (HTTP batched, non-blocking) ─────────────────────────────

interface LokiConfig {
  url: string;           // http://loki:3100/loki/api/v1/push
  labels: Record<string, string>; // { app: "btp-api", service: "api" }
  batchSize: number;
  flushIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

class LokiTransport {
  private readonly config: LokiConfig;
  private pending: Array<{ tsNs: string; line: string }> = [];
  private flushing = false;
  private retryCount = 0;
  private active = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private lastErrorValue = "";
  private lastErrorAt = 0;

  constructor(config: LokiConfig) {
    this.config = config;
  }

  get isActive(): boolean { return this.active; }
  get lastError(): string { return this.lastErrorValue; }

  static fromEnv(): LokiConfig | null {
    const url = process.env.LOG_LOKI_URL;
    if (!url) return null;
    return {
      url,
      labels: {
        app: process.env.LOG_LOKI_APP ?? "btp-api",
        service: process.env.LOG_LOKI_SERVICE ?? "api",
        env: process.env.NODE_ENV ?? "development",
      },
      batchSize: parseInt(process.env.LOG_LOKI_BATCH_SIZE ?? "50", 10),
      flushIntervalMs: parseInt(process.env.LOG_LOKI_FLUSH_INTERVAL_MS ?? "500", 10),
      timeoutMs: parseInt(process.env.LOG_LOKI_TIMEOUT_MS ?? "5000", 10),
      maxRetries: parseInt(process.env.LOG_LOKI_MAX_RETRIES ?? "3", 10),
      retryDelayMs: parseInt(process.env.LOG_LOKI_RETRY_DELAY_MS ?? "1000", 10),
    };
  }

  push(line: string, tsNs: string): void {
    if (!this.active) return;
    this.pending.push({ tsNs, line });
    if (this.pending.length >= this.config.batchSize) {
      this.flush();
    }
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  private buildBody(entries: Array<{ tsNs: string; line: string }>): string {
    const streams: Array<{ stream: Record<string, string>; values: Array<[string, string]> }> = [];
    for (const { tsNs, line } of entries) {
      const last = streams[streams.length - 1];
      if (last) {
        last.values.push([tsNs, line]);
      } else {
        streams.push({ stream: { ...this.config.labels }, values: [[tsNs, line]] });
      }
    }
    return JSON.stringify({ streams });
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0 || !this.active) return;
    this.flushing = true;
    const batch = this.pending.splice(0);
    const body = this.buildBody(batch);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const res = await fetch(this.config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        this.retryCount = 0;
        this.lastErrorValue = "";
      } else {
        const text = await res.text().catch(() => "");
        throw new Error(`Loki ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      this.retryCount++;
      this.lastErrorValue = err instanceof Error ? err.message : String(err);
      this.lastErrorAt = Date.now();
      const waitMs = this.config.retryDelayMs * Math.min(this.retryCount, this.config.maxRetries);

      if (this.retryCount >= this.config.maxRetries) {
        this.active = false;
        if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
        console.error(`[logger] Loki transport deactivated: ${this.lastErrorValue}`);
        return;
      }

      // Retry with exponential backoff
      setTimeout(() => {
        this.pending = [...batch, ...this.pending];
        this.flush();
      }, waitMs);
      return;
    }

    this.flushing = false;
    if (this.pending.length > 0) this.flush();
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    await this.flush();
  }

  async recover(): Promise<void> {
    this.active = true;
    this.retryCount = 0;
    this.lastErrorValue = "";
  }
}

// ── Disk fallback (async WriteStream batch) ──────────────────────────────────

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

async function rotateLogFile(
  logFile: string,
  maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES,
  maxFiles: number = DEFAULT_MAX_FILES,
): Promise<void> {
  const { stat, unlink, rename } = await import("node:fs/promises");
  try {
    const { size } = await stat(logFile);
    if (size < maxSizeBytes) return;
    const oldest = `${logFile}.${maxFiles}`;
    try { await unlink(oldest); } catch { /* ignore */ }
    for (let i = maxFiles - 1; i >= 1; i--) {
      const src = `${logFile}.${i}`;
      const dst = `${logFile}.${i + 1}`;
      try { await unlink(dst); } catch { /* ignore */ }
      try { await rename(src, dst); } catch { /* ignore */ }
    }
    try { await rename(logFile, `${logFile}.1`); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

class DiskFallback {
  private stream: WriteStream | null = null;
  private pending: string[] = [];
  private flushing = false;
  private diskFull = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private filePath: string;
  private maxQueueSize: number;
  private flushIntervalMs: number;

  constructor(filePath: string, maxQueueSize = 200, flushIntervalMs = 100) {
    this.filePath = filePath;
    this.maxQueueSize = maxQueueSize;
    this.flushIntervalMs = flushIntervalMs;
  }

  private ensureStream(): void {
    if (this.stream) return;
    this.stream = createWriteStream(this.filePath, { flags: "a", encoding: "utf8" });
    this.stream.on("error", () => { this.diskFull = true; this.closeStream(); });
  }

  private closeStream(): void {
    if (this.stream) { this.stream.destroy(); this.stream = null; }
  }

  push(line: string): void {
    if (this.diskFull) return;
    this.ensureStream();
    if (!this.stream) { this.diskFull = true; return; }
    this.pending.push(line + "\n");
    if (this.pending.length >= this.maxQueueSize) this.flush();
    if (!this.flushTimer) this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  private flush(): void {
    if (this.flushing || this.pending.length === 0 || !this.stream) return;
    this.flushing = true;
    const batch = this.pending.splice(0);
    const CHUNK = 50;
    let i = 0;
    const writeNext = (): void => {
      if (i >= batch.length || !this.stream) {
        this.flushing = false;
        if (this.pending.length > 0) this.flush();
        return;
      }
      const chunk = batch.slice(i, i + CHUNK);
      i += CHUNK;
      let ok = true;
      for (const line of chunk) {
        ok = this.stream!.write(line);
        if (!ok) break;
      }
      if (!ok) { this.stream.once("drain", writeNext); }
      else { setImmediate(writeNext); }
    };
    writeNext();
  }

  async flushSync(): Promise<void> {
    if (this.flushing) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => { if (!this.flushing) { clearInterval(check); resolve(); } }, 10);
      });
    }
    this.flush();
  }

  async close(): Promise<void> {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    await this.flushSync();
    this.closeStream();
  }

  async rotate(maxSizeBytes?: number, maxFiles?: number): Promise<void> {
    await rotateLogFile(this.filePath, maxSizeBytes, maxFiles);
  }
}

// ── Disk watchdog ────────────────────────────────────────────────────────────

class DiskWatchdog {
  private checkIntervalMs = 60_000;
  private maxPercent = 90;
  private logDir: string;
  private fallback: DiskFallback;
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: ((full: boolean) => void) | null = null;

  constructor(logDir: string, fallback: DiskFallback) {
    this.logDir = logDir;
    this.fallback = fallback;
  }

  setMaxPercent(p: number): void { this.maxPercent = p; }
  setCheckInterval(ms: number): void { this.checkIntervalMs = ms; }
  onDiskFull(cb: (full: boolean) => void): void { this.callback = cb; }

  start(): void {
    this.timer = setInterval(() => this.check(), this.checkIntervalMs);
    this.check();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async check(): Promise<void> {
    try {
      const { exec } = await import("node:child_process");
      const { stdout } = await new Promise<{ stdout: string }>((res, rej) =>
        exec(`df -P "${this.logDir}" 2>/dev/null | tail -1`, (err, stdout) => err ? rej(err) : res({ stdout }))
      );
      const parts = stdout.trim().split(/\s+/);
      const usePercent = parseInt(parts[4] ?? "", 10);
      if (isNaN(usePercent)) return;
      const full = usePercent >= this.maxPercent;
      (this.fallback as unknown as Record<string, unknown>)["diskFull"] = full;
      this.callback?.(full);
    } catch { /* ignore */ }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNanoTs(isoString: string): string {
  const ms = new Date(isoString).getTime();
  return String(ms * 1_000_000).padStart(20, "0");
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Logger avec transport Loki (Grafana Loki) + fallback disque.
 *
 * - Loki actif → lignes envoyées en batch HTTP (Loki /loki/api/v1/push)
 * - Loki indisponible → fallback automatique sur WriteStream disque
 * - Loki reconnecté → fallback remis à zéro, Loki reprend
 * - Zéro I/O disque bloquant
 */
export function createLogger(config: LoggerConfig): Logger {
  const sink: LogSink = config.sink
    ?? config.defaultSink
    ?? (config.formatted ? formattedSink : jsonSink);
  const threshold = LEVEL_RANK[config.level];

  function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < threshold) return;
    sink({
      level,
      message,
      time: new Date().toISOString(),
      fields: redact({ ...config.baseFields, ...fields }) as Record<string, unknown>,
    });
  }

  function makeChild(extra: Record<string, unknown>): Logger {
    return createLogger({ ...config, baseFields: { ...config.baseFields, ...extra } });
  }

  // ── Loki transport ──────────────────────────────────────────────────────
  const lokiConfig = LokiTransport.fromEnv();
  let lokiTransport: LokiTransport | null = null;
  if (lokiConfig) {
    lokiTransport = new LokiTransport(lokiConfig);
    lokiTransport.recover();
  }

  // ── Disk fallback ───────────────────────────────────────────────────────
  const logFile = config.logDir ? join(config.logDir, "app.log") : undefined;
  const securityLogFile = config.logDir ? join(config.logDir, "security.log") : undefined;
  const diskFallback = logFile
    ? new DiskFallback(logFile, config.maxQueueSize ?? 200, config.flushIntervalMs ?? 100)
    : null;
  const securityFallback = securityLogFile
    ? new DiskFallback(securityLogFile, config.maxQueueSize ?? 200, config.flushIntervalMs ?? 100)
    : null;

  if (logFile) {
    mkdir(config.logDir!, { recursive: true }).catch(() => {});
  }

  // ── Disk watchdog ───────────────────────────────────────────────────────
  let watchdog: DiskWatchdog | null = null;
  if (diskFallback && config.logDir) {
    watchdog = new DiskWatchdog(config.logDir, diskFallback);
    watchdog.setMaxPercent(config.diskMaxPercent ?? 90);
    watchdog.setCheckInterval(config.diskCheckIntervalMs ?? 60_000);
    watchdog.onDiskFull((full) => {
      if (full) {
        sink({
          level: "error",
          message: "LOG_DISK_FULL: disque plein, écritures fichier suspendues",
          time: new Date().toISOString(),
          fields: { diskPercent: full, logDir: config.logDir },
        });
      }
    });
    watchdog.start();
  }

  // ── Enqueue helpers ─────────────────────────────────────────────────────
  function buildEntry(level: LogLevel, message: string, fields?: Record<string, unknown>): LogEntry {
    return {
      level,
      message,
      time: new Date().toISOString(),
      fields: redact({ ...config.baseFields, ...fields }) as Record<string, unknown>,
    };
  }

  function enqueue(entry: LogEntry): void {
    const tsNs = toNanoTs(entry.time);
    const line = JSON.stringify({
      ts: entry.time,
      level: entry.level,
      _msg: entry.message,
      ...entry.fields,
    });

    if (lokiTransport?.isActive) {
      lokiTransport.push(line, tsNs);
      return;
    }
    if (diskFallback) diskFallback.push(line);
  }

  function enqueueSecurity(message: string, meta: Record<string, unknown>): void {
    const entry = buildEntry("warn", message, meta);
    const tsNs = toNanoTs(entry.time);
    const line = JSON.stringify({
      ts: entry.time,
      level: "WARN",
      _msg: entry.message,
      ...entry.fields,
    });

    if (lokiTransport?.isActive) {
      lokiTransport.push(line, tsNs);
      return;
    }
    if (securityFallback) securityFallback.push(line);
  }

  return {
    trace: (m, f) => { write("trace", m, f); enqueue(buildEntry("trace", m, f)); },
    debug: (m, f) => { write("debug", m, f); enqueue(buildEntry("debug", m, f)); },
    info: (m, f) => { write("info", m, f); enqueue(buildEntry("info", m, f)); },
    warn: (m, f) => { write("warn", m, f); enqueue(buildEntry("warn", m, f)); },
    error: (m, f) => { write("error", m, f); enqueue(buildEntry("error", m, f)); },
    child: makeChild,

    async rotateLogs(): Promise<void> {
      if (diskFallback) await diskFallback.rotate(config.maxSizeBytes, config.maxFiles);
    },

    security: (message, meta) => {
      write("warn", message, meta);
      enqueueSecurity(message, meta ?? {});
    },

    async cleanupOldLogs(): Promise<number> {
      if (!logFile || !config.logDir) return 0;
      let removed = 0;
      try {
        const { readdir: readdir_ } = await import("node:fs/promises");
        const files = await readdir_(config.logDir);
        for (const file of files) {
          const m = file.match(/^app\.log\.(\d+)$/);
          if (m) {
            const num = parseInt(m[1] ?? "0", 10);
            if (num > (config.maxFiles ?? DEFAULT_MAX_FILES)) {
              await unlink(join(config.logDir, file));
              removed++;
            }
          }
        }
      } catch { /* ignore */ }
      return removed;
    },

    async shutdown(): Promise<void> {
      await Promise.all([
        lokiTransport?.shutdown() ?? Promise.resolve(),
        diskFallback?.close() ?? Promise.resolve(),
        securityFallback?.close() ?? Promise.resolve(),
        watchdog?.stop() ?? Promise.resolve(),
      ]);
    },
  };
}
