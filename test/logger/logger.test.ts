import { describe, expect, it } from "bun:test";
import { createLogger } from "../../src/libs/logger/index.ts";

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
});
