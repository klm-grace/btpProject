# Db

Client PostgreSQL pour backend **Bun.js**, encapsulant `Bun.SQL`.

## Rôle

- Ouvre une connexion PostgreSQL via une URL injectée.
- Expose `ping()`, `queryOne()` (tagged template paramétré) et le client SQL brut.
- **Injection** : la config (`url`) est passée en paramètre — aucun `process.env`.

## API publique

`src/libs/db/index.ts` :

- `createDb(config: DbConfig)` → `Db`
  - `sql` — client Bun.SQL (tagged template)
  - `ping()` → `Promise<boolean>`
  - `queryOne\`SELECT ...\`` → `Promise<T | null>`
  - `close()` → `Promise<void>`

## Prérequis

- Bun.js ≥ 1.1 (Bun.SQL natif)
- PostgreSQL accessible via l'URL fournie

## Exemple d'import dans un autre projet

```ts
import { createDb } from "./src/libs/db/index.ts";

const db = createDb({ url: "postgres://u:p@127.0.0.1:5432/mydb" });

const ok = await db.ping(); // true
const row = await db.queryOne<{ n: number }>`SELECT 1 AS n`;
await db.close();
```

## Notes

- **Pas** de `process.env` ; **aucun** port ; pas d'effet de bord à l'import.
- Requêtes paramétrées uniquement (tagged templates) — jamais de concaténation SQL.
- Extractible en package sans réécriture.
