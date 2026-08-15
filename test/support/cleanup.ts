/**
 * Nettoie la base de données de test entre les exécutons.
 */
import { createDb } from "@libs/db";
import { createConfig } from "@libs/config";

export async function cleanupTestDB(): Promise<void> {
  const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: "test" };
  const config = createConfig().parse(env);
  const db = createDb(config.db);

  try {
    await db.sql`DELETE FROM project_categories`;
    await db.sql`DELETE FROM project_images`;
    await db.sql`DELETE FROM service_projects`;
    await db.sql`DELETE FROM projects`;
    await db.sql`DELETE FROM categories`;
    await db.sql`DELETE FROM services`;
    await db.sql`DELETE FROM team_members`;
    await db.sql`DELETE FROM content_sections`;
    await db.sql`DELETE FROM seo_metas`;
    await db.sql`DELETE FROM settings`;
    await db.sql`DELETE FROM company_profile`;
    await db.sql`DELETE FROM audit_logs`;
    await db.sql`DELETE FROM media`;
    await db.sql`DELETE FROM contact_requests`;
    await db.sql`DELETE FROM quote_requests`;
    await db.sql`DELETE FROM quote_request_files`;
    await db.sql`DELETE FROM appointments`;
  } finally {
    await db.close();
  }
}
