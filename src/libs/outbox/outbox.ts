/**
 * outbox — Bibliothèque de file d'événements email (pattern Outbox).
 *
 * Patterns :
 * 1. L'application insère un événement dans `outbox_events` (DB) au lieu
 *    d'appeler directement un service SMTP.
 * 2. Un process worker (non inclus ici) consomme les événements `pending`
 *    et tente l'envoi.
 * 3. En cas d'échec, le worker incrémente `retry_count` et remet à jour
 *    `updated_at`. Au-delà du seuil, l'événement est marqué `failed`.
 *
 * Tout est injecté — pas de lecture de process.env.
 */

import { randomUUID } from "node:crypto";
import type { Outbox, OutboxDeps, OutboxConfig, OutboxEvent } from "./types.ts";

export function createOutbox(deps: OutboxDeps, config: OutboxConfig): Outbox {
  const { db, log } = deps;

  async function enqueue(eventType: "email" | "notification", data: {
    recipient: string;
    subject: string;
    payload: Record<string, unknown>;
  }): Promise<string> {
    const now = new Date().toISOString();
    const id = randomUUID();

    await db.sql.unsafe(
      `INSERT INTO outbox_events (id, event_type, payload, published, created_at)
       VALUES ($1, $2, $3::jsonb, false, $4)`,
      [id, eventType, JSON.stringify(data.payload), now],
    );

    log?.info("Event enqueued in outbox", { id, eventType });
    return id;
  }

  return { enqueue };
}

export type { Outbox, OutboxDeps, OutboxConfig, OutboxEvent } from "./types.ts";