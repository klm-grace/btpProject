# Health

Agrégateur d'état de santé des dépendances pour backend **Bun.js**.

## Rôle

- Vérifie l'état de PostgreSQL, Redis (et d'autres deps injectées).
- Produit un rapport typé (`ok` / `degraded` / `down`) avec latence.
- **Injection** : les deps (`db.ping`, `redis.ping`) sont passées en paramètre.

## API publique

`src/libs/health/index.ts` :

- `createHealthChecker(deps?)` → `HealthChecker`
  - `check()` → `Promise<HealthReport>`

`HealthReport` = `{ status, uptime, timestamp, dependencies[] }`.

## Exemple d'import dans un autre projet

```ts
import { createHealthChecker } from "./src/libs/health/index.ts";
import { createDb } from "./src/libs/db/index.ts";
import { createRedis } from "./src/libs/redis/index.ts";

const db = createDb({ url: dbUrl });
const redis = createRedis({ url: redisUrl });
const health = createHealthChecker({ db, redis });

const report = await health.check();
// { status: "ok", uptime: 12, timestamp: "...", dependencies: [...] }
```

## Notes

- **Pas** de `process.env` ; **aucun** port ; pas d'effet de bord à l'import.
- N'expose jamais le détail technique d'une erreur de ping.
- Extractible en package sans réécriture.
