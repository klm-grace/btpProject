import type { SecurityEventType, SecurityEventRecord, SecurityEventsDeps, SecurityEventsConfig } from "./types.ts";
import { createHash } from "node:crypto";

function hashIP(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

export function createSecurityEvents(deps: SecurityEventsDeps, config: SecurityEventsConfig) {
  const db = deps.db;
  const defaultLimit = config.defaultLimit ?? 50;
  const autoPurgeHours = config.autoPurgeHours ?? 0;

  async function recordEvent(params: {
    userId?: string | null;
    eventType: SecurityEventType;
    ip?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const { userId, eventType, ip, userAgent, details = {} } = params;

    await db.sql.unsafe(
      `INSERT INTO security_events (id, user_id, event_type, ip_address, user_agent, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        require("node:crypto").randomUUID(),
        userId ?? null,
        eventType,
        hashIP(ip ?? null),
        userAgent ?? null,
        JSON.stringify(details),
      ],
    );
  }

  async function getEvents(query: {
    userIds?: string[];
    eventType?: SecurityEventType | SecurityEventType[];
    limit?: number;
    offset?: number;
  } = {}): Promise<SecurityEventRecord[]> {
    const { userIds, eventType, limit = defaultLimit, offset = 0 } = query;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (userIds && userIds.length > 0) {
      conditions.push(`user_id = ANY($${idx}::uuid[])`);
      params.push(userIds);
      idx++;
    }

    if (eventType) {
      const types = Array.isArray(eventType) ? eventType : [eventType];
      const placeholders = types.map((_, i) => `$${idx + i}`).join(", ");
      conditions.push(`event_type IN (${placeholders})`);
      params.push(...types);
      idx += types.length;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.sql.unsafe(
      `SELECT id, user_id, event_type, 
              CASE WHEN ip_address IS NOT NULL THEN ip_address::text ELSE NULL END AS ip_address,
              user_agent, details, created_at
       FROM security_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return rows as unknown as SecurityEventRecord[];
  }

  async function purgeOldEvents(): Promise<number> {
    if (autoPurgeHours <= 0) return 0;

    const result = await db.sql.unsafe(
      `DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '${autoPurgeHours} hours'`,
    );
    return (result as any as { rowCount?: number }).rowCount ?? 0;
  }

  async function countByType(userIds: string[], eventType: SecurityEventType): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};

    const rows = await db.sql.unsafe(
      `SELECT event_type, COUNT(*)::int AS count
       FROM security_events
       WHERE user_id = ANY($1::uuid[]) AND event_type = $2
       GROUP BY event_type`,
      [userIds, eventType],
    );

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[(row as any).event_type] = (row as any).count;
    }
    return result;
  }

  return { recordEvent, getEvents, purgeOldEvents, countByType };
}
