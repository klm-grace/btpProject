# Logger

Logger structuré **JSON** pour backend **Bun.js**, avec niveaux, champs par défaut et sous-loggers (`child`).

## Rôle

- Écrit des entrées JSON 1-ligne (`{level,message,time,fields}`), agrégables.
- Filtre selon un seuil de niveau.
- `child(fields)` pour attacher un contexte (ex. `requestId`) sans le répéter.
- **Injection** : on passe un `sink` dans la config — cette bibliothèque ne lit jamais `process.env`.

## API publique

`src/libs/logger/index.ts` :

- `createLogger(config)` avec `config = { level, sink?, baseFields? }`
- Retourne `{ trace, debug, info, warn, error, child(fields) }`

Niveaux : `trace` < `debug` < `info` < `warn` < `error`.

## Exemple d'import dans un autre projet

```ts
import { createLogger } from "./src/libs/logger/index.ts";

const log = createLogger({ level: "info" });
log.info("server started", { port: 4000 });

const reqLog = log.child({ requestId: "req-1" });
reqLog.error("panel failed", { code: "E_1" });
// {"level":"error","message":"panel failed","time":"...","fields":{"requestId":"req-1","code":"E_1"}}
```

Test avec un sink mémoire :

```ts
const out: unknown[] = [];
const log = createLogger({ level: "debug", sink: (e) => out.push(e) });
```

## Notes

- **Pas** de `process.env` ; **aucun** port ; pas d'effet de bord à l'import.
- Ne loggue rien d'autre que `fields` fournis — pas de mot de passe/token implicite.
- **Redaction automatique** : les valeurs des clés `password`, `token`, `secret`,
  `authorization`, `mfa_code`, `api_key`, `session_token`, etc. (y compris imbriquées
  dans des objets) sont remplacées par `[REDACTED]` avant l'écriture. Défense en
  profondeur — la discipline manuelle reste requise (ne jamais logger de secret).
- Extractible en package sans réécriture.