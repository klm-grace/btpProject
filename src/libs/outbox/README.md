# outbox — Bibliothèque de file d'attente email (Outbox Pattern)

## Rôle

Implémenter le **pattern Outbox** pour la fiabilisation des envois email :
au lieu d'appeler un service SMTP directement depuis un handler, l'événement
est persisté en base. Un worker externe (à part) consomme les événements
en attente et gère les retries.

## API publique

```ts
import { createOutbox } from "@libs/outbox";

const outbox = createOutbox({ db, log }, { consentVersion: "1.0" });
const eventId = await outbox.enqueue("email", {
  recipient: "client@example.com",
  subject: "Merci pour votre contact",
  payload: { name: "Jean", message: "..." },
});
```

## Dépendances injectées

| Dépendance | Type | Rôle |
|-----------|------|------|
| `db` | `{ sql: { unsafe(...) } }` | Écriture dans `outbox_events` |
| `log` | `{ info(...), warn(...), error(...) }` | Journalisation |

## Config

| Clé | Type | Défaut | Rôle |
|-----|------|--------|------|
| `consentVersion` | `string` | — | Version du consentement RGPD associée à l'événement |

## Schéma DB (migration 010)

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
```

## Exemple d'import dans un autre projet

```ts
import { createOutbox } from "@libs/outbox";
import type { OutboxDeps } from "@libs/outbox/types";

const deps: OutboxDeps = { db: myDb, log: myLogger };
const outbox = createOutbox(deps, { consentVersion: "1.0" });

await outbox.enqueue("email", {
  recipient: "user@example.com",
  subject: "Welcome",
  payload: { username: "john" },
});
```
