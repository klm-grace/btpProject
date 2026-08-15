# `@libs/admin-rate-limit` — Rate limiting avec doubling ban progressif

## Rôle

Protège les routes admin contre les abus avec un système de ban progressif :
chaque violation duplique la durée du ban (1h → 2h → 4h → ... → cap).

## API

```ts
import { createAdminRateLimiter } from "@libs/admin-rate-limit";

const limiter = createAdminRateLimiter({ redis }, {
  maxRequests: 30,
  windowSeconds: 60,
  baseBanHours: 1,
  maxBanHours: 48,
});

const result = await limiter.check(ip, endpoint);
// result.allowed === false && result.ban !== undefined → 429
```

## Doubling ban

| Violation | Durée du ban |
|-----------|-------------|
| 1ère      | 1h          |
| 2ème      | 2h          |
| 3ème      | 4h          |
| 4ème      | 8h          |
| 5ème+     | 16h (cap 48h) |

## Prérequis

- Redis pour le stockage des compteurs et bans
