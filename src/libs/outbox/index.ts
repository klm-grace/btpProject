/**
 * outbox — Bibliothèque de file d'événements email (pattern Outbox).
 *
 * File d'attente persistante pour les envois email.
 * L'application insère un événement, un worker externe le consomme.
 * Réutilisable hors projet BTP.
 */

export type { Outbox, OutboxDeps, OutboxConfig, OutboxEvent } from "./types.ts";
export { createOutbox } from "./outbox.ts";