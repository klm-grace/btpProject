import { join } from "node:path";
import { loadSqlFiles } from "./loader.ts";
import type { MigrationFile, MigrationResult, MigrationStatus, Migrations } from "./types.ts";

/** Config de la bibliothèque (pas de process.env ici — l'app injecte). */
export interface MigrationsConfig {
  /** Client db injecté (createDb). */
  db: {
    sql: SqlClientLike;
    queryOne: <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...params: unknown[]
    ) => Promise<T | null>;
  };
  /** Logger optionnel (createLogger). */
  logger?: Logger;
  /** Chemin vers le dossier migrations SQL (relatif ou absolu). */
  migrationsDir: string;
  /** Chemin vers le dossier seeds SQL (optionnel). */
  seedsDir?: string;
}

const MIGRATIONS_TABLE = "_migrations";

async function ensureMigrationsTable(db: MigrationsConfig["db"]): Promise<void> {
  await db.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(db: MigrationsConfig["db"]): Promise<Set<string>> {
  const rows = await db.sql.unsafe<{ name: string }>(`SELECT name FROM _migrations ORDER BY id`);
  return new Set(rows.map((r) => r.name));
}

/**
 * Crée un gestionnaire de migrations.
 *
 * Injection : db + logger optionnels. Aucun process.env, aucun port.
 */
export function createMigrations(config: MigrationsConfig): Migrations {
  const { db, logger, migrationsDir } = config;

  return {
    async up(): Promise<MigrationResult> {
      await ensureMigrationsTable(db);
      const applied = await getAppliedMigrations(db);
      const files = await loadSqlFiles(migrationsDir);
      const pending = files.filter((f) => !applied.has(f.name));

      if (pending.length === 0) {
        logger?.info("no pending migrations");
        return { applied: 0, names: [] };
      }

      const appliedNames: string[] = [];
      for (const file of pending) {
        logger?.info("applying migration", { name: file.name });
        // Exécution dans une transaction pour atomicité
        await db.sql.begin(async (tx) => {
          await tx.unsafe(file.sql);
          await tx.unsafe(`INSERT INTO _migrations (name) VALUES ($1)`, [file.name]);
        });
        appliedNames.push(file.name);
        logger?.info("migration applied", { name: file.name });
      }

      return { applied: appliedNames.length, names: appliedNames };
    },

    async down(n = 1): Promise<MigrationResult> {
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("down(n) : n doit être un entier positif");
      }
      await ensureMigrationsTable(db);
      const rows = await db.sql.unsafe<{ name: string; id: number }>(
        `SELECT id, name FROM _migrations ORDER BY id DESC LIMIT $1`,
        [n],
      );

      if (rows.length === 0) {
        logger?.info("no migrations to rollback");
        return { applied: 0, names: [] };
      }

      const rolledBack: string[] = [];
      // Rollback dans l'ordre inverse
      for (const row of [...rows].reverse()) {
        logger?.info("rolling back migration", { name: row.name });
        // Si un fichier down existe, on l'exécute
        const downFile = join(migrationsDir, `down_${row.name}`);
        try {
          const { readFile } = await import("node:fs/promises");
          const downSql = await readFile(downFile, "utf-8");
          await db.sql.begin(async (tx) => {
            await tx.unsafe(downSql);
            await tx.unsafe(`DELETE FROM _migrations WHERE name = $1`, [row.name]);
          });
        } catch {
          // Pas de fichier down → on supprime juste l'enregistrement
          await db.sql.unsafe(`DELETE FROM _migrations WHERE name = $1`, [row.name]);
        }
        rolledBack.push(row.name);
        logger?.info("migration rolled back", { name: row.name });
      }

      return { applied: rolledBack.length, names: rolledBack };
    },

    async status(): Promise<MigrationStatus[]> {
      await ensureMigrationsTable(db);
      const applied = await getAppliedMigrations(db);
      const files = await loadSqlFiles(migrationsDir);

      return files.map((f) => ({
        name: f.name,
        applied_at: applied.has(f.name) ? "applied" : null,
      }));
    },
  };
}
