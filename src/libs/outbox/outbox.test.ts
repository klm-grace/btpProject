import { describe, expect, it, beforeEach } from "bun:test";
import { createOutbox } from "./outbox.ts";
import type { OutboxDeps } from "./types.ts";

function makeMockDeps() {
  const events: Array<{
    id: string;
    eventType: string;
    recipient: string;
    subject: string;
    payload: unknown;
    status: string;
  }> = [];
  const logEntries: Array<{ level: string; msg: string; meta?: Record<string, unknown> }> = [];

  const db = {
    sql: {
      async unsafe<T = Record<string, unknown>>(sqlStr: string, params?: unknown[]): Promise<T[]> {
        if (sqlStr.includes("INSERT INTO outbox_events")) {
          const [id, eventType, payload] = params! as [string, string, string];
          events.push({ id: id as string, eventType: eventType as string, recipient: "", subject: "", payload: JSON.parse(payload as string), status: "pending" });
          return [] as T[];
        }
        return [] as T[];
      },
    },
  };

  const log = {
    info(msg: string, meta?: Record<string, unknown>) {
      logEntries.push({ level: "info", msg, meta });
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      logEntries.push({ level: "warn", msg, meta });
    },
    error(msg: string, meta?: Record<string, unknown>) {
      logEntries.push({ level: "error", msg, meta });
    },
  };

  return { db: db as unknown as OutboxDeps["db"], log, events, logEntries };
}

describe("outbox", () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let outbox: ReturnType<typeof createOutbox>;

  beforeEach(() => {
    deps = makeMockDeps();
    outbox = createOutbox(deps as unknown as OutboxDeps, { consentVersion: "1.0" });
  });

  it("enqueue insère un événement pending avec ID UUID", async () => {
    const eventId = await outbox.enqueue("email", {
      recipient: "test@example.com",
      subject: "Test subject",
      payload: { name: "Test" },
    });
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(deps.events).toHaveLength(1);
    expect(deps.events[0]!.eventType).toBe("email");
    expect(deps.events[0]!.payload).toEqual({ name: "Test" });
  });

  it("enqueue log un info", async () => {
    await outbox.enqueue("email", {
      recipient: "a@b.com",
      subject: "Hello",
      payload: {},
    });
    expect(deps.logEntries.some((e) => e.level === "info" && e.msg === "Event enqueued in outbox")).toBe(true);
  });

  it("enqueue avec notification fonctionne aussi", async () => {
    const eventId = await outbox.enqueue("notification", {
      recipient: "admin@example.com",
      subject: "Alert",
      payload: { alert: "critical" },
    });
    expect(eventId).toBeDefined();
    expect(deps.events[0]!.eventType).toBe("notification");
  });

  it("payload JSON est correctement stocké", async () => {
    const complexPayload = { items: [1, 2, 3], metadata: { key: "value" } };
    await outbox.enqueue("email", {
      recipient: "x@y.com",
      subject: "Complex",
      payload: complexPayload,
    });
    expect(deps.events[0]!.payload).toEqual(complexPayload);
  });
});