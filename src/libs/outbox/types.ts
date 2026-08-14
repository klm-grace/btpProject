/**
 * outbox — Bibliothèque de file d'événements email (pattern Outbox).
 *
 * Aucun process.env, aucun port, extraction possible.
 */

export interface OutboxDeps {
  db: {
    sql: {
      unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    };
  };
  log?: {
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
  };
}

export interface OutboxConfig {
  /** Version du consentement RGPD associée aux événements. */
  consentVersion: string;
}

export interface OutboxEvent {
  id: string;
  eventType: "email" | "notification";
  recipient: string;
  subject: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Outbox {
  enqueue(eventType: "email" | "notification", data: {
    recipient: string;
    subject: string;
    payload: Record<string, unknown>;
  }): Promise<string>;
}