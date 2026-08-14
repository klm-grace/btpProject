/**
 * outbox — Bibliothèque de file d'événements email (pattern Outbox).
 *
 * L'application insère un événement, un worker externe le consomme.
 * Réutilisable hors projet BTP.
 */

export { createOutbox } from "./outbox.ts";
export type { Outbox, OutboxDeps, OutboxConfig, OutboxEvent } from "./outbox.ts";
