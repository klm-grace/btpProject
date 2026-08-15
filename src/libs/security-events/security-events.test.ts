import { describe, expect, it } from "bun:test";
import { createSecurityEvents } from "./security-events.ts";
import type { SecurityEventsDeps, SecurityEventsConfig } from "./types.ts";

function makeDeps() {
  const records: any[] = [];
  const deps: SecurityEventsDeps = {
    db: {
      unsafe: async () => [] as any[],
      sql: {
        async unsafe<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
          if (sql.includes("INSERT")) {
            const record = {
              id: params?.[0] as string,
              user_id: params?.[1],
              event_type: params?.[2],
              ip_address: params?.[3],
              user_agent: params?.[4],
              details: params?.[5],
              created_at: new Date().toISOString(),
            };
            records.push(record);
            return [] as T[];
          }
          if (sql.includes("DELETE")) {
            return [{ rowCount: 0 }] as unknown as T[];
          }
          let result = records.slice().reverse();
          let pIdx = 0;
          if (sql.includes("ANY")) {
            const userIds = params?.[pIdx++] as string[];
            result = result.filter((r: any) => userIds?.includes(r.user_id));
          }
          if (sql.includes("event_type =")) {
            const type = params?.[pIdx++] as string;
            result = result.filter((r: any) => r.event_type === type);
          } else if (sql.includes("event_type IN")) {
            const types = params?.slice(pIdx) as string[];
            result = result.filter((r: any) => types?.includes(r.event_type));
            pIdx += types.length;
          }
          const limit = Number(params?.[params.length - 2] ?? 50);
          const offset = Number(params?.[params.length - 1] ?? 0);
          return result.slice(offset, offset + limit) as unknown as T[];
        },
      },
    },
  };
  return { deps, records };
}

describe("SecurityEvents", () => {
  it("enregistre et récupère un événement login_failed", async () => {
    const { deps } = makeDeps();
    const events = createSecurityEvents(deps, { defaultLimit: 10 });
    await events.recordEvent({ eventType: "login_failed", ip: "192.168.1.1" });
    const result = await events.getEvents({ eventType: "login_failed" });
    expect(result.length).toBe(1);
    expect(result[0]!.event_type).toBe("login_failed");
    expect(result[0]!.ip_address).toBe("192.168.1.1");
  });

  it("filtre par eventType", async () => {
    const { deps } = makeDeps();
    const events = createSecurityEvents(deps, { defaultLimit: 10 });
    await events.recordEvent({ eventType: "login_failed", ip: "1.1.1.1" });
    await events.recordEvent({ eventType: "rate_limit_exceeded", ip: "10.0.0.1" });
    const failed = await events.getEvents({ eventType: "login_failed" });
    const limited = await events.getEvents({ eventType: "rate_limit_exceeded" });
    expect(failed.length).toBe(1);
    expect(limited.length).toBe(1);
  });

  it("filtre par userIds", async () => {
    const { deps } = makeDeps();
    const events = createSecurityEvents(deps, { defaultLimit: 10 });
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    await events.recordEvent({ eventType: "login_failed", userId, ip: "1.2.3.4" });
    await events.recordEvent({ eventType: "login_failed", ip: "5.5.5.5" });
    const filtered = await events.getEvents({ userIds: [userId], eventType: "login_failed" });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.ip_address).toBe("1.2.3.4");
  });

  it("purgeOldEvents retourne 0 si autoPurgeHours=0", async () => {
    const { deps } = makeDeps();
    const events = createSecurityEvents(deps, { defaultLimit: 10 });
    const count = await events.purgeOldEvents();
    expect(count).toBe(0);
  });
});
