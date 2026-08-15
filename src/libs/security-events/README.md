# `@libs/security-events` — Journal des événements de sécurité

## Rôle

Enregistre et consulte les événements de sécurité dans la table `security_events` (PostgreSQL).

## API

```ts
import { createSecurityEvents } from "@libs/security-events";

const securityEvents = createSecurityEvents({ db }, { defaultLimit: 50 });

await securityEvents.recordEvent({
  eventType: "login_failed",
  userId: "uuid",
  ip: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  details: { reason: "invalid_password" },
});

const events = await securityEvents.getEvents({ eventType: "login_failed", limit: 20 });
```

## Types d'événements

`login_failed`, `login_success`, `brute_force_lockout`, `rate_limit_exceeded`,
`account_flagged`, `account_unflagged`, `suspicious_ip`, `mfa_failed`,
`password_changed`, `session_hijack_attempt`

## Prérequis

- PostgreSQL avec table `security_events` (migration 011)
- Client DB avec `sql.unsafe(sql, params)`
