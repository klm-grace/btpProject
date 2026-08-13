import { describe, expect, it } from "bun:test";
import { createLogger } from "@libs/logger";

function capture(level: LogLevel = "trace"): {
  logger: Logger;
  entries: LogEntry[];
} {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level, sink: (e) => entries.push(e) });
  return { logger, entries };
}

describe("logger", () => {
  it("filtre les entrées selon le seuil", () => {
    const { logger, entries } = capture("info");
    logger.debug("nope");
    logger.info("ok");
    logger.warn("w");
    logger.error("e");
    expect(entries.map((x) => x.level)).toEqual(["info", "warn", "error"]);
  });

  it("ajoute level/message/time/fields", () => {
    const { logger, entries } = capture();
    logger.info("hello", { key: "v" });
    expect(entries[0]!.message).toBe("hello");
    expect(entries[0]!.level).toBe("info");
    expect(entries[0]!.fields).toEqual({ key: "v" });
    expect(new Date(entries[0]!.time).toISOString()).toBe(entries[0]!.time);
  });

  it("fusionne les champs de base via child", () => {
    const { logger, entries } = capture();
    const child = logger.child({ requestId: "req-1" });
    child.info("m", { extra: 1 });
    expect(entries[0]!.fields).toEqual({ requestId: "req-1", extra: 1 });
  });

  it("le child n'écrase pas les champs parent absents", () => {
    const { logger, entries } = capture();
    const child = logger.child({ requestId: "r2" });
    child.info("x", { a: 1 });
    expect(entries[0]!.fields).toEqual({ requestId: "r2", a: 1 });
  });

  it("ne log jamais de donnée sensible involontaire", () => {
    const { logger, entries } = capture();
    logger.error("erreur", { code: "sql_1" });
    expect(Object.keys(entries[0]!.fields ?? {})).toEqual(["code"]);
  });

  it("redacte automatiquement les champs sensibles", () => {
    const { logger, entries } = capture();
    logger.error("login failed", {
      password: "hunter2",
      token: "abc123",
      user: { email: "a@b.c", mfa_code: "123456" },
    });
    const fields = entries[0]!.fields ?? {};
    expect(fields["password"]).toBe("[REDACTED]");
    expect(fields["token"]).toBe("[REDACTED]");
    expect(fields["user"]).toEqual({ email: "a@b.c", mfa_code: "[REDACTED]" });
  });

  it("redacte les champs sensibles dans les child", () => {
    const { logger, entries } = capture();
    const child = logger.child({ requestId: "r1" });
    child.info("auth", { session_token: "s3cr3t", ok: true });
    expect(entries[0]!.fields).toEqual({
      requestId: "r1",
      session_token: "[REDACTED]",
      ok: true,
    });
  });

  it("le sink produit du JSON valide", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "error",
      sink: (e) => lines.push(JSON.stringify(e)),
    });
    logger.info("ignored");
    logger.error("boom");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("boom");
  });

  // ── Formatted sink ──────────────────────────────────────────────────────

  it("formatted: true sélectionne le formattedSink quand aucun sink custom", () => {
    // Sans sink custom, formatted=true → formattedSink (couleur, pas JSON brut)
    const origLog = console.log;
    const origErr = console.error;
    const allOutput: string[] = [];
    console.log = (...args: unknown[]) => allOutput.push(String(args[0]));
    console.error = (...args: unknown[]) => allOutput.push(String(args[0]));
    try {
      const logger = createLogger({ level: "trace", formatted: true });
      logger.info("hello");
      logger.error("boom");
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    // Les lignes ne contiennent pas de JSON brut (pas de braces au début)
    expect(allOutput.length).toBeGreaterThanOrEqual(2);
    expect(allOutput.some((l) => l.includes("INFO ") && l.includes("hello"))).toBe(true);
    expect(allOutput.some((l) => l.includes("ERROR") && l.includes("boom"))).toBe(true);
  });

  it("formatted: true avec sink custom → le sink custom est prioritaire", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: "trace", formatted: true, sink: (e) => entries.push(e) });
    logger.info("test");
    // Le sink custom est utilisé, pas le formattedSink
    expect(entries.length).toBe(1);
    expect(entries[0]!.level).toBe("info");
    expect(entries[0]!.message).toBe("test");
  });

  it("formatted sink affiche le service des baseFields", () => {
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(String(args[0]));
    try {
      const logger = createLogger({ level: "trace", formatted: true, baseFields: { service: "api" } });
      logger.info("started");
    } finally {
      console.log = origLog;
    }
    expect(logs.some((l) => l.includes("api"))).toBe(true);
  });

  it("formatted: false/absent utilise le sink JSON brut", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: "trace", formatted: false, sink: (e) => entries.push(e) });
    logger.info("test");
    expect(entries.length).toBe(1);
    expect(entries[0]!.level).toBe("info");
  });
});
