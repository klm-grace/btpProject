/**
 * Handlers Settings — Paramètres globaux clé-valeur.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const settingValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const settingWriteSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, "Clé invalide (alphanumérique, tirets, points uniquement)"),
  value: settingValueSchema,
});

const settingsBatchSchema = z.record(z.string(), settingValueSchema);

// ── GET /api/admin/settings ───────────────────────────────────────────────────

export const handleSettingsList: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "settings.manage");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const url = new URL(req.url);
  const prefix = url.searchParams.get("prefix") as string | null;

  if (prefix) {
    const rows = await app.db.sql.unsafe(
      `SELECT key, value, updated_at FROM settings WHERE key LIKE $1 ORDER BY key ASC`,
      [`${prefix}%`],
    );
    return jsonOk({ data: rows });
  }

  const rows = await app.db.sql`
    SELECT key, value, updated_at FROM settings ORDER BY key ASC
  `;

  return jsonOk({ data: rows });
};

// ── GET /api/admin/settings/:key ──────────────────────────────────────────────

export const handleSettingsGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "settings.manage");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const key = ctx.params.key;
  if (!key) {
    return jsonErrorResponse({ message: "Clé requise", code: "MISSING_KEY" }, 400);
  }

  const row = await app.db.sql.unsafe(
    `SELECT key, value, updated_at FROM settings WHERE key = $1`,
    [key],
  );

  if (!row || row.length === 0) {
    return jsonErrorResponse({ message: "Clé non trouvée", code: "NOT_FOUND" }, 404);
  }

  return jsonOk({ data: row[0] });
};

// ── PUT /api/admin/settings/:key ──────────────────────────────────────────────

export const handleSettingsUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "settings.manage");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const key = ctx.params.key;
  if (!key) {
    return jsonErrorResponse({ message: "Clé requise", code: "MISSING_KEY" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = settingWriteSchema.parse(body);

    if (parsed.key !== key) {
      return jsonErrorResponse({ message: "La clé dans le body ne correspond pas à l'URL", code: "KEY_MISMATCH" }, 400);
    }

    const existing = await app.db.sql.unsafe(
      `SELECT key, value FROM settings WHERE key = $1`,
      [key],
    );

    if (existing && existing.length > 0) {
      await app.db.sql.unsafe(
        `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2`,
        [JSON.stringify(parsed.value), key],
      );

      await app.db.sql.unsafe(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
         VALUES ($1, $2, 'update', 'setting', $3, $4, $5, NOW())`,
        [randomUUID(), user.id, key, JSON.stringify({ key, value: existing![0]!.value }), JSON.stringify({ key, value: parsed.value })],
      );
    } else {
      await app.db.sql.unsafe(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())`,
        [key, JSON.stringify(parsed.value)],
      );

      await app.db.sql.unsafe(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
         VALUES ($1, $2, 'create', 'setting', $3, $4, NOW())`,
        [randomUUID(), user.id, key, JSON.stringify({ key, value: parsed.value })],
      );
    }

    // Invalidate cache
    if (app.redis) {
      await app.redis.del(`setting:${key}`).catch(() => undefined);
    }

    app.log.info("Setting updated", { userId: user.id, key });
    return jsonOk({ data: { key, value: parsed.value } });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── DELETE /api/admin/settings/:key ───────────────────────────────────────────

export const handleSettingsDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "settings.manage");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const key = ctx.params.key;
  if (!key) {
    return jsonErrorResponse({ message: "Clé requise", code: "MISSING_KEY" }, 400);
  }

  const existing = await app.db.sql.unsafe(
    `SELECT key, value FROM settings WHERE key = $1`,
    [key],
  );
  if (!existing || existing.length === 0) {
    return jsonErrorResponse({ message: "Clé non trouvée", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql.unsafe(`DELETE FROM settings WHERE key = $1`, [key]);

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'setting', $3, $4, NOW())`,
    [randomUUID(), user.id, key, JSON.stringify({ key, value: existing![0]!.value })],
  );

  // Invalidate cache
  if (app.redis) {
    await app.redis.del(`setting:${key}`).catch(() => undefined);
  }

  app.log.info("Setting deleted", { userId: user.id, key });
  return jsonOk({ message: "Clé supprimée" });
};

// ── POST /api/admin/settings/batch ────────────────────────────────────────────

export const handleSettingsBatchUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "settings.manage");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = settingsBatchSchema.parse(body);

    for (const [key, value] of Object.entries(parsed)) {
      const existing = await app.db.sql.unsafe(
        `SELECT key, value FROM settings WHERE key = $1`,
        [key],
      );

      if (existing && existing.length > 0) {
        await app.db.sql.unsafe(
          `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2`,
          [JSON.stringify(value), key],
        );
      } else {
        await app.db.sql.unsafe(
          `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())`,
          [key, JSON.stringify(value)],
        );
      }

      // Invalidate cache per key
      if (app.redis) {
        await app.redis.del(`setting:${key}`).catch(() => undefined);
      }
    }

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'batch_update', 'settings', 'all', $3, NOW())`,
      [randomUUID(), user.id, JSON.stringify(Object.keys(parsed))],
    );

    app.log.info("Settings batch updated", { userId: user.id, keys: Object.keys(parsed) });
    return jsonOk({ message: `${Object.keys(parsed).length} paramètre(s) mis à jour` });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};
