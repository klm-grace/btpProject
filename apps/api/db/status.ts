import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createLogger } from "@libs/logger";
import { createMigrations } from "@libs/migrations";
import { resolve } from "node:path";

const config = createConfig().parse(process.env);
const log = createLogger({ level: config.log.level, baseFields: { service: "db:status" } });
const db = createDb({ url: config.db.url });

const migrationsDir = resolve(import.meta.dir, "../../../migrations");
const migrations = createMigrations({ db, logger: log, migrationsDir });

try {
  const status = await migrations.status();
  const applied = status.filter((s) => s.applied_at !== null);
  const pending = status.filter((s) => s.applied_at === null);

  console.log(`\nMigration Status:`);
  console.log(`  Applied: ${applied.length}`);
  console.log(`  Pending: ${pending.length}`);

  if (applied.length > 0) {
    console.log(`\nApplied migrations:`);
    for (const m of applied) {
      console.log(`  ✓ ${m.name}`);
    }
  }

  if (pending.length > 0) {
    console.log(`\nPending migrations:`);
    for (const m of pending) {
      console.log(`  ○ ${m.name}`);
    }
  }
} catch (err) {
  log.error("status check failed", { error: (err as Error).message });
  process.exit(1);
} finally {
  await db.close();
}
