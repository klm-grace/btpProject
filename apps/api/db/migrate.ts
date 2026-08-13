import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createLogger } from "@libs/logger";
import { createMigrations } from "@libs/migrations";
import { resolve } from "node:path";

const config = createConfig().parse(process.env);
const log = createLogger({ level: config.log.level, baseFields: { service: "migrate" } });
const db = createDb({ url: config.db.url });

const migrationsDir = resolve(import.meta.dir, "../../../migrations");
const migrations = createMigrations({ db, logger: log, migrationsDir });

try {
  log.info("starting migrations");
  const result = await migrations.up();
  if (result.applied === 0) {
    log.info("no pending migrations");
  } else {
    log.info("migrations applied", { count: result.applied, names: result.names });
  }
} catch (err) {
  log.error("migration failed", { error: (err as Error).message });
  process.exit(1);
} finally {
  await db.close();
}
