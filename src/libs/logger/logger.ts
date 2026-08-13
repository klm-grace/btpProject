const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** Clés de champs dont la valeur est systématiquement masquée (défense en profondeur). */
const SENSITIVE_KEYS = new Set([
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
  "totp",
  "api_key",
  "apikey",
  "private_key",
  "password_hash",
]);

/** Remplace la valeur des clés sensibles par "[REDACTED]". */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    out[key] = SENSITIVE_KEYS.has(lower) ? "[REDACTED]" : redact(val, depth + 1);
  }
  return out;
}

function defaultSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

/** Construit un logger structuré (JSON). Configuration injectée, aucune env. */
export function createLogger(config: LoggerConfig): Logger {
  const sink: LogSink = config.sink ?? config.defaultSink ?? defaultSink;
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
