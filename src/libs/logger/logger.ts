const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

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
      fields: { ...config.baseFields, ...fields },
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
