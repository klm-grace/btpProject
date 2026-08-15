/**
 * Handlers SEO Metas — CRUD metadata SEO par entité.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { logLoginAttempt, logForbiddenAccess, logIntrusionAttempt } from "../utils/logger-helpers";
import { isValidUUID } from "../utils/validate";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const seoMetaCreateSchema = z.object({
  entityType: z.enum(["content_section", "project", "service", "page", "custom"]),
  entityId: z.string().uuid(),
  title: z.string().max(60).optional().nullable(),
  description: z.string().max(160).optional().nullable(),
  ogImage: z.string().url("URL og_image invalide").optional().nullable(),
});

const seoMetaUpdateSchema = z.object({
  title: z.string().max(60).optional().nullable(),
  description: z.string().max(160).optional().nullable(),
  ogImage: z.string().url("URL og_image invalide").optional().nullable(),
});

// ── GET /api/admin/seo-metas ──────────────────────────────────────────────────

export const handleSeoMetaList: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") as string | null;

  if (entityType) {
    const rows = await app.db.sql.unsafe(
      `SELECT id, entity_type, entity_id, title, description, og_image, created_at, updated_at
       FROM seo_metas
       WHERE entity_type = $1
       ORDER BY entity_id ASC`,
      [entityType],
    );
    return jsonOk({ data: rows });
  }

  const rows = await app.db.sql`
    SELECT id, entity_type, entity_id, title, description, og_image, created_at, updated_at
    FROM seo_metas
    ORDER BY entity_type ASC, entity_id ASC
  `;

  return jsonOk({ data: rows });
};

// ── GET /api/admin/seo-metas/:entityType/:entityId ────────────────────────────

export const handleSeoMetaGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const entityType = ctx.params.entityType;
  const entityId = ctx.params.entityId;
  if (!entityType || !entityId) {
    return jsonErrorResponse({ message: "entityType et entityId requis", code: "MISSING_PARAMS" }, 400);
  }

  // Validate UUID format for entityId
  if (!isValidUUID(entityId)) {
    return jsonErrorResponse({ message: "Format d\'identifiant invalide", code: "INVALID_UUID" }, 400);
  }

  try {
    const meta = await app.db.sql.unsafe(
      `SELECT id, entity_type, entity_id, title, description, og_image, created_at, updated_at
       FROM seo_metas
       WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId],
    );

    if (!meta || meta.length === 0) {
      return jsonErrorResponse({ message: "Méta SEO non trouvée", code: "NOT_FOUND" }, 404);
    }

    return jsonOk({ data: meta[0] });
  } catch (e: unknown) {
    if ((e as Error).message?.includes("invalid input syntax for type uuid")) {
      return jsonErrorResponse({ message: "Format d'identifiant invalide", code: "INVALID_UUID" }, 400);
    }
    app.log.error("SEO meta get error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── POST /api/admin/seo-metas ─────────────────────────────────────────────────

export const handleSeoMetaCreate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    app.log.debug("SEO create body", { body: JSON.stringify(body) });
    const parsed = seoMetaCreateSchema.parse(body);
    const id = randomUUID();

    await app.db.sql.unsafe(
      `INSERT INTO seo_metas (id, entity_type, entity_id, title, description, og_image, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [id, parsed.entityType, parsed.entityId, parsed.title ?? null, parsed.description ?? null, parsed.ogImage ?? null],
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'create', 'seo_meta', $3, $4, NOW())`,
      [randomUUID(), user.id, id, JSON.stringify({ entityType: parsed.entityType, entityId: parsed.entityId })],
    );

    app.log.info("SEO meta created", { userId: user.id, entityType: parsed.entityType, entityId: parsed.entityId });
    return jsonOk({ data: { id } }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("SEO create error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur lors de l'enregistrement", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── PUT /api/admin/seo-metas/:entityType/:entityId ───────────────────────────

export const handleSeoMetaUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const entityType = ctx.params.entityType;
  const entityId = ctx.params.entityId;
  if (!entityType || !entityId) {
    return jsonErrorResponse({ message: "entityType et entityId requis", code: "MISSING_PARAMS" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = seoMetaUpdateSchema.parse(body);

    const existing = await app.db.sql.unsafe(
      `SELECT * FROM seo_metas WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId],
    );
    if (!existing || existing.length === 0) {
      return jsonErrorResponse({ message: "Méta SEO non trouvée", code: "NOT_FOUND" }, 404);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.title !== undefined) { updates.push(`title = $${idx++}`); values.push(parsed.title); }
    if (parsed.description !== undefined) { updates.push(`description = $${idx++}`); values.push(parsed.description); }
    if (parsed.ogImage !== undefined) { updates.push(`og_image = $${idx++}`); values.push(parsed.ogImage); }

    updates.push(`updated_at = NOW()`);
    values.push(entityType, entityId);

    await app.db.sql.unsafe(
      `UPDATE seo_metas SET ${updates.join(", ")} WHERE entity_type = $${idx} AND entity_id = $${idx + 1}`,
      values,
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'seo_meta', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, existing![0]!.id, JSON.stringify(existing![0]!), JSON.stringify(parsed)],
    );

    app.log.info("SEO meta updated", { userId: user.id, entityType, entityId });
    return jsonOk({ message: "Méta SEO modifiée" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("SEO error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── DELETE /api/admin/seo-metas/:entityType/:entityId ─────────────────────────

export const handleSeoMetaDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const entityType = ctx.params.entityType;
  const entityId = ctx.params.entityId;
  if (!entityType || !entityId) {
    return jsonErrorResponse({ message: "entityType et entityId requis", code: "MISSING_PARAMS" }, 400);
  }

  // Validate UUID format
  if (!isValidUUID(entityId)) {
    return jsonErrorResponse({ message: "Format d\'identifiant invalide", code: "INVALID_UUID" }, 400);
  }

  try {
    const existing = await app.db.sql.unsafe(
      `SELECT * FROM seo_metas WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId],
    );
    if (!existing || existing.length === 0) {
      return jsonErrorResponse({ message: "Méta SEO non trouvée", code: "NOT_FOUND" }, 404);
    }

    await app.db.sql.unsafe(
      `DELETE FROM seo_metas WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId],
    );

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'seo_meta', $3, $4, NOW())`,
    [randomUUID(), user.id, existing![0]!.id, JSON.stringify({ entityType, entityId })],
  );

    app.log.info("SEO meta deleted", { userId: user.id, entityType, entityId });
    return jsonOk({ message: "Méta SEO supprimée" });
  } catch (e: unknown) {
    app.log.error("SEO meta delete error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};
