# Migrations

Bibliothèque de gestion de migrations SQL versionnées pour backend **Bun.js**.

## Rôle

- Charge les fichiers `.sql` d'un dossier, les applique en ordre, et enregistre chaque migration exécutée dans la table `_migrations`.
- Fournit `up()` (appliquer), `down()` (rétrograder) et `status()` (vérifier).
- **Injection** : `db` et `logger` (optionnel). Aucun `process.env`, aucun port.

## API publique

`src/libs/migrations/index.ts` :

- `createMigrations(config)` → `Migrations`
  - `up()` → `Promise<MigrationResult>`
  - `down(n?)` → `Promise<MigrationResult>`
  - `status()` → `Promise<MigrationStatus[]>`

## Prérequis

- Bun.js ≥ 1.1 (Bun.SQL natif)
- PostgreSQL accessible via l'URL fournie
- Fichiers SQL dans un dossier (chemin fourni en config)

## Exemple d'import dans un autre projet

```ts
import { createMigrations } from "./src/libs/migrations/index.ts";
import { createDb } from "./src/libs/db/index.ts";

const db = createDb({ url: "postgres://u:p@127.0.0.1:5432/mydb" });
const migrations = createMigrations({
  db,
  migrationsDir: "./migrations",
});

const result = await migrations.up();
console.log(`${result.applied} migrations appliquées`);
```

## Structure des fichiers

```
migrations/
  001_enable_extensions.sql
  002_create_enums.sql
  ...
seeds/
  001_admin_user.sql
```

Les fichiers `.sql` sont triés par nom (ordre lexicographique). La table `_migrations` enregistre les migrations appliquées.

## Notes

- **Pas** de `process.env` ; **aucun** port ; pas d'effet de bord à l'import.
- Chaque migration s'exécute dans une transaction PostgreSQL.
- Les fichiers `down_<nom>.sql` (optionnels) permettent le rollback.
- **Sécurité** : `down(n)` valide `n` (`Number.isInteger` et `n >= 1`) et passe le
  `LIMIT` en paramètre bindé — jamais de concaténation SQL.
- Extractible en package sans réécriture.
