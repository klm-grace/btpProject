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
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
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
  // Générique
  "password",
  "passwd",
  "pwd",
  "token",
  "access_token",
  "refresh_token",
  "session_token",
  "secret",
  "client_secret",
  "authorization",
  "cookie",
  "set-cookie",
  "mfa_code",
  "mfa_token",
  "mfa_secret",
  "totp",
  "api_key",
  "apikey",
  "private_key",
  "password_hash",
  // Section 5+ : auth spécifiques
  "sid",
  "csrf_token",
  "session_id",
  "recovery_code",
  "otp",
  "otp_code",
  "mfa_setup_secret",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;

  // Un Error brut a des propriétés non énumérables → Object.entries renvoie {}.
  // On le sérialise explicitement pour ne jamais perdre message/stack.
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

// ── Sink JSON brut (production, logs structurés) ─────────────────────────────

function jsonSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ── Sink formaté couleur (terminal / dev) ────────────────────────────────────

function formatField(key: string, value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return `${C.gray}${key}${C.reset}=${C.dim}null${C.reset}`;
  if (typeof value === "string") return `${C.gray}${key}${C.reset}=${C.white}${value}${C.reset}`;
  if (typeof value === "number") return `${C.gray}${key}${C.reset}=${C.cyan}${String(value)}${C.reset}`;
  if (typeof value === "boolean") return `${C.gray}${key}${C.reset}=${C.yellow}${String(value)}${C.reset}`;
  return `${C.gray}${key}${C.reset}=${C.white}${JSON.stringify(value)}${C.reset}`;
}

function formattedSink(entry: LogEntry): void {
  const time = new Date(entry.time).toISOString().slice(11, 23); // HH:mm:ss.SSS
  const color = LEVEL_COLOR[entry.level];
  const label = LEVEL_LABEL[entry.level];
  const level = `${color}${C.bold}${label}${C.reset}`;

  const fields = entry.fields ?? {};
  const service = fields.service ? `${C.cyan}${C.bold}${fields.service}${C.reset}  ` : "";

  const extraEntries = Object.entries(fields).filter(([k]) => k !== "service");
  const extra = extraEntries.length > 0
    ? "  " + extraEntries.map(([k, v]) => formatField(k, v)).join("  ")
    : "";

  const line = `${C.gray}${time}${C.reset} ${level}  ${service}${C.bold}${entry.message}${C.reset}${extra}`;

  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Construit un logger structuré (JSON ou formaté).
 *
 * - `formatted: true` → sortie couleur ANSI pour le terminal (dev).
 * - `formatted: false/absent` → JSON brut 1 ligne (production, agrégable).
 *
 * Configuration injectée, aucune env, aucun port.
 */
export function createLogger(config: LoggerConfig): Logger {
  // Si un sink custom est fourni, il est prioritaire
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
    return createLogger({
      ...config,
      baseFields: { ...config.baseFields, ...extra },
    });
  }

  return {
    trace: (m, f) => write("trace", m, f),
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: makeChild,
  };
}
