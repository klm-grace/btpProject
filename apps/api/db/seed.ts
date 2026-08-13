import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createLogger } from "@libs/logger";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const config = createConfig().parse(process.env);
const log = createLogger({ level: config.log.level, baseFields: { service: "seed" } });
const db = createDb({ url: config.db.url });

try {
  log.info("starting seed");

  // 1. Insérer les rôles et permissions
  const rolesSql = await readFile(
    resolve(import.meta.dir, "../../../seeds/001_admin_user.sql"),
    "utf-8"
  );
  await db.sql.begin(async (tx) => {
    await tx.unsafe(rolesSql);
  });
  log.info("roles and permissions seeded");

  // 2. Insérer l'utilisateur admin (mot de passe : admin1234 en dev)
  const passwordHash = await Bun.password.hash("admin1234", "argon2id");
  await db.sql`
    INSERT INTO users (id, email, password_hash, first_name, last_name, status)
    VALUES (
      '00000000-0000-0000-0000-000000000099',
      'admin@btp-dev.local',
      ${passwordHash},
      'Admin',
      'System',
      'active'
    )
    ON CONFLICT (email) DO NOTHING
  `;
  log.info("admin user seeded");

  // 3. Attribuer le rôle admin
  await db.sql`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (
      '00000000-0000-0000-0000-000000000099',
      '00000000-0000-0000-0000-000000000001'
    )
    ON CONFLICT DO NOTHING
  `;
  log.info("admin role assigned");

  log.info("seed completed");
} catch (err) {
  log.error("seed failed", { error: (err as Error).message });
  process.exit(1);
} finally {
  await db.close();
}
