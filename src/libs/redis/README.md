# Redis

Client Redis pour backend **Bun.js**, encapsulant `Bun.RedisClient`.

## Rôle

- Ouvre une connexion Redis via une URL injectée.
- Expose `ping()`, `get()`, `set()`, `del()` et le client brut.
- **Injection** : la config (`url`) est passée en paramètre — aucun `process.env`.

## API publique

`src/libs/redis/index.ts` :

- `createRedis(config: RedisConfig)` → `Redis`
  - `client` — client Bun.RedisClient brut
  - `ping()` → `Promise<boolean>`
  - `get(key)` / `set(key, value)` / `del(...keys)`
  - `close()` → `Promise<void>`

## Prérequis

- Bun.js ≥ 1.1 (Bun.RedisClient natif)
- Redis accessible via l'URL fournie

## Exemple d'import dans un autre projet

```ts
import { createRedis } from "./src/libs/redis/index.ts";

const redis = createRedis({ url: "redis://127.0.0.1:6379" });

const ok = await redis.ping(); // true
await redis.set("hello", "world");
const v = await redis.get("hello"); // "world"
await redis.close();
```

## Notes

- **Pas** de `process.env` ; **aucun** port ; pas d'effet de bord à l'import.
- Extractible en package sans réécriture.
