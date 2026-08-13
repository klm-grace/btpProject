import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createMigrations } from "@libs/migrations";
import { resolve } from "node:path";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://btp_dev:btp_dev_password@127.0.0.1:5432/btp_dev",
  REDIS_URL: process.env.REDIS_URL ?? "redis://:btp_dev_redis_password@127.0.0.1:6379",
  NODE_ENV: "test",
};

let db: Db | null = null;
let available = false;

beforeAll(async () => {
  try {
    const cfg = createConfig().parse(env);
    db = createDb({ url: cfg.db.url });
    available = await db.ping();
  } catch {
    available = false;
  }
});

afterAll(async () => {
  if (db) await db.close();
});

describe("migrations", () => {
  it("la table _migrations existe et contient 11 entrées", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const row = await db.queryOne<{ count: number }>`SELECT COUNT(*)::int as count FROM _migrations`;
    expect(row).not.toBeNull();
    expect(row!.count).toBe(11);
  });

  it("toutes les tables obligatoires existent", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const tables = [
      "users", "roles", "permissions", "role_permissions", "user_roles",
      "sessions", "audit_logs", "security_events",
      "settings", "company_profile", "content_sections", "seo_metas",
      "media", "media_variants", "categories", "projects",
      "project_categories", "project_images",
      "services", "service_projects", "team_members",
      "contact_requests", "quote_requests", "quote_request_files", "appointments",
      "outbox_events",
    ];
    for (const table of tables) {
      const row = await db.queryOne<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}
        ) as exists
      `;
      expect(row?.exists).toBe(true);
    }
  });

  it("les contraintes CHECK existent sur les enums", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    // Vérifie que les enums sont créés
    const enums = await db.sql<{ typname: string }>`
      SELECT typname FROM pg_type WHERE typname IN (
        'user_status', 'content_status', 'lead_status', 'media_type', 'appointment_status'
      ) ORDER BY typname
    `;
    expect(enums.length).toBe(5);
  });

  it("les index sont présents", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const indexes = await db.sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
      ORDER BY indexname
    `;
    // Au moins 20 index créés par les migrations
    expect(indexes.length).toBeGreaterThanOrEqual(20);
  });

  it("les clés étrangères sont présentes", async () => {
    if (!available || !db) {
      console.warn("[skip] PostgreSQL non disponible");
      return;
    }
    const fks = await db.sql<{ count: number }>`
      SELECT COUNT(*)::int as count
      FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
    `;
    expect(fks[0]!.count).toBeGreaterThanOrEqual(10);
  });

  it("createMigrations retourne une interface valide", async () => {
    const cfg = createConfig().parse(env);
    const testDb = createDb({ url: cfg.db.url });
    const migrations = createMigrations({
      db: testDb,
      migrationsDir: resolve(import.meta.dir, "../../migrations"),
    });
    const status = await migrations.status();
    expect(status.length).toBe(11);
    expect(status.every((s) => s.applied_at !== null)).toBe(true);
    await testDb.close();
  });

  it("up() ne réapplique pas les migrations déjà exécutées", async () => {
    const cfg = createConfig().parse(env);
    const testDb = createDb({ url: cfg.db.url });
    const migrations = createMigrations({
      db: testDb,
      migrationsDir: resolve(import.meta.dir, "../../migrations"),
    });
    const result = await migrations.up();
    expect(result.applied).toBe(0);
    expect(result.names).toEqual([]);
    await testDb.close();
  });
});
