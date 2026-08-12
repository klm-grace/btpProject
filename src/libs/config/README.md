# Config

Documente, valide et saine les variables d'environnement d'un backend **Bun.js** à l'aide de **Zod** (unique lib de validation de la stack).

## Rôle

- Reçoit un objet `Record<string, string|undefined>` (typiquement `process.env`).
- Applique les **défauts**, valide les types (port, niveau de log, URLs), rejette les valeurs invalides.
- Produit un objet typé `AppConfig` consommé par l'app.

**L'app lit `process.env` et l'injecte** — cette bibliothèque ne lit jamais `process.env`.

## API publique

`src/libs/config/index.ts` :

- `createConfig()` → `{ parse(raw) → AppConfig, validate(raw) → {ok,data}|{ok:false,error} }`
- `parseUrl(raw)` → `URL` (parse sans réseau)

`RawEnv = Record<string, string | undefined>` ;
`AppConfig` = `{ env, server{host,port}, log{level}, db{url}, redis{url} }`.

## Variables attendues

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `development` | `development \| test \| production` |
| `PORT` | `4000` | port HTTP de l'API |
| `HOST` | `127.0.0.1` | bind de l'API |
| `LOG_LEVEL` | `info` | `trace \| debug \| info \| warn \| error` |
| `DATABASE_URL` | — (requis) | URL PostgreSQL (`Bun.sql`) |
| `REDIS_URL` | — (requis) | URL Redis (`Bun.redis`) |

Le contrat dev/prod : **mêmes noms de variables, valeurs différentes**.

## Exemple d'import dans un autre projet

```ts
import { createConfig } from "./src/libs/config/index.ts";

const cfg = createConfig().parse(process.env); // l'app injecte l'env
```

```ts
// Usage pur / test sans process.env
const cfg = createConfig().parse({
  NODE_ENV: "test",
  DATABASE_URL: "postgres://u:p@127.0.0.1:5432/t",
  REDIS_URL: "redis://127.0.0.1:6379",
});
```

## Notes

- Dépend de `zod` uniquement.
- **Pas** de `process.env` dans la bibliothèque ; **aucun** port ouvert ; pas d'effet de bord à l'import.
- Extractible en package sans réécriture.