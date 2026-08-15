/**
 * Handlers Services — CRUD complet.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const serviceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
  shortDescription: z.string().max(500).optional().nullable(),
  fullDescription: z.string().max(5000).optional().nullable(),
  icon: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const serviceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide").optional(),
  shortDescription: z.string().max(500).optional().nullable(),
  fullDescription: z.string().max(5000).optional().nullable(),
  icon: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapDbError(error: unknown): { code: string; message: string } {
  const msg = (error as Error).message ?? "";
  if (msg.includes("Unique constraint")) return { code: "SLUG_CONFLICT", message: "Ce slug existe déjà" };
  if (msg.includes("slug")) return { code: "INVALID_SLUG", message: "Slug invalide" };
  return { code: "VALIDATION_ERROR", message: "Erreur lors de l'enregistrement" };
}

// ── GET /api/admin/services ────────────────────────────────────────────────────

export const handleServiceList: RouteHandler = async (req, ctx) => {
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
  const page = parseInt(url.searchParams.get("page") ?? "1") || 1;
  const limit = parseInt(url.searchParams.get("limit") ?? "20") || 20;
  const offset = (page - 1) * limit;
  const status = url.searchParams.get("status") as "draft" | "published" | "archived" | null;

  const whereClause = status ? `WHERE status = $1 AND deleted_at IS NULL` : `WHERE deleted_at IS NULL`;
  const countWhereClause = status ? `WHERE status = $1` : `WHERE deleted_at IS NULL`;
  const params: unknown[] = status ? [status] : [];

  const [rows, total] = await Promise.all([
    app.db.sql.unsafe(
      `SELECT id, name, slug, short_description, icon, sort_order, status, version, created_at, updated_at
       FROM services ${whereClause}
       ORDER BY sort_order ASC, name ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    app.db.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM services ${countWhereClause}`,
      params,
    ),
  ]);

  return jsonOk({
    data: rows,
    pagination: {
      page,
      limit,
      total: total[0]!.count as number,
      pages: Math.ceil(total[0]!.count as number / limit),
    },
  });
};

// ── GET /api/admin/services/:id ────────────────────────────────────────────────

export const handleServiceGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const serviceId = ctx.params.id;
  if (!serviceId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const service = await app.db.sql`
    SELECT id, name, slug, short_description, full_description, icon, sort_order, status, version, created_at, updated_at
    FROM services
    WHERE id = ${serviceId} AND deleted_at IS NULL
  `;

  if (!service) {
    return jsonErrorResponse({ message: "Service non trouvé", code: "NOT_FOUND" }, 404);
  }

  return jsonOk({ data: service });
};

// ── POST /api/admin/services ──────────────────────────────────────────────────

export const handleServiceCreate: RouteHandler = async (req, ctx) => {
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
    const body = await req.json();
    const parsed = serviceCreateSchema.parse(body);
    const id = randomUUID();

    await app.db.sql.unsafe(
      `INSERT INTO services (id, name, slug, short_description, full_description, icon, sort_order, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())`,
      [id, parsed.name, parsed.slug, parsed.shortDescription ?? null, parsed.fullDescription ?? null, parsed.icon ?? null, parsed.sortOrder, parsed.status],
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'create', 'service', $3, $4, NOW())`,
      [randomUUID(), user.id, id, JSON.stringify({ name: parsed.name, slug: parsed.slug })],
    );

    app.log.info("Service created", { userId: user.id, id });
    return jsonOk({ data: { id } }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── PUT /api/admin/services/:id ───────────────────────────────────────────────

export const handleServiceUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const serviceId = ctx.params.id;
  if (!serviceId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = await req.json();
    const parsed = serviceUpdateSchema.parse(body);

    const existing = await app.db.sql`SELECT * FROM services WHERE id = ${serviceId} AND deleted_at IS NULL`;
    if (!existing) {
      return jsonErrorResponse({ message: "Service non trouvé", code: "NOT_FOUND" }, 404);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.name !== undefined) { updates.push(`name = $${idx++}`); values.push(parsed.name); }
    if (parsed.slug !== undefined) { updates.push(`slug = $${idx++}`); values.push(parsed.slug); }
    if (parsed.shortDescription !== undefined) { updates.push(`short_description = $${idx++}`); values.push(parsed.shortDescription); }
    if (parsed.fullDescription !== undefined) { updates.push(`full_description = $${idx++}`); values.push(parsed.fullDescription); }
    if (parsed.icon !== undefined) { updates.push(`icon = $${idx++}`); values.push(parsed.icon); }
    if (parsed.sortOrder !== undefined) { updates.push(`sort_order = $${idx++}`); values.push(parsed.sortOrder); }
    if (parsed.status !== undefined) { updates.push(`status = $${idx++}`); values.push(parsed.status); }

    updates.push(`version = version + 1, updated_at = NOW()`);
    values.push(serviceId);

    await app.db.sql.unsafe(
      `UPDATE services SET ${updates.join(", ")} WHERE id = $${idx}`,
      values,
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'service', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, serviceId, JSON.stringify(existing), JSON.stringify(parsed)],
    );

    app.log.info("Service updated", { userId: user.id, id: serviceId });
    return jsonOk({ message: "Service modifié" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── DELETE /api/admin/services/:id ────────────────────────────────────────────

export const handleServiceDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const serviceId = ctx.params.id;
  if (!serviceId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`SELECT * FROM services WHERE id = ${serviceId} AND deleted_at IS NULL`;
  if (!existing) {
    return jsonErrorResponse({ message: "Service non trouvé", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`UPDATE services SET deleted_at = NOW(), status = 'archived' WHERE id = ${serviceId}`;

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'service', $3, $4, NOW())`,
    [randomUUID(), user.id, serviceId, JSON.stringify({ name: (existing as any[])[0]?.name, slug: (existing as any[])[0]?.slug })],
  );

  app.log.info("Service deleted", { userId: user.id, id: serviceId });
  return jsonOk({ message: "Service supprimé" });
};

// ── POST /api/admin/services/:id/publish ──────────────────────────────────────

export const handleServicePublish: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const serviceId = ctx.params.id;
  if (!serviceId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  await app.db.sql`UPDATE services SET status = 'published', updated_at = NOW() WHERE id = ${serviceId}`;

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
     VALUES ($1, $2, 'publish', 'service', $3, $4, NOW())`,
    [randomUUID(), user.id, serviceId, JSON.stringify({ status: "published" })],
  );

  app.log.info("Service published", { userId: user.id, id: serviceId });
  return jsonOk({ message: "Service publié" });
};

// ── POST /api/admin/services/:id/unpublish ────────────────────────────────────

export const handleServiceUnpublish: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const serviceId = ctx.params.id;
  if (!serviceId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  await app.db.sql`UPDATE services SET status = 'draft', updated_at = NOW() WHERE id = ${serviceId}`;

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
     VALUES ($1, $2, 'unpublish', 'service', $3, $4, NOW())`,
    [randomUUID(), user.id, serviceId, JSON.stringify({ status: "draft" })],
  );

  app.log.info("Service unpublished", { userId: user.id, id: serviceId });
  return jsonOk({ message: "Service dépublié" });
};
