/**
 * Handlers Équipe — CRUD membres de l'équipe.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const memberCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.string().max(200).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  photoMediaId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

const memberUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.string().max(200).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  photoMediaId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

// ── GET /api/admin/team ───────────────────────────────────────────────────────

export const handleTeamList: RouteHandler = async (_req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const rows = await app.db.sql`
    SELECT id, first_name, last_name, role, bio, photo_media_id, sort_order, created_at, updated_at
    FROM team_members
    WHERE deleted_at IS NULL
    ORDER BY sort_order ASC, last_name ASC, first_name ASC
  `;

  return jsonOk({ data: rows });
};

// ── POST /api/admin/team ──────────────────────────────────────────────────────

export const handleTeamCreate: RouteHandler = async (req, ctx) => {
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
    const parsed = memberCreateSchema.parse(body);
    const id = randomUUID();

    await app.db.sql.unsafe(
      `INSERT INTO team_members (id, first_name, last_name, role, bio, photo_media_id, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [id, parsed.firstName, parsed.lastName, parsed.role ?? null, parsed.bio ?? null, parsed.photoMediaId ?? null, parsed.sortOrder],
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'create', 'team_member', $3, $4, NOW())`,
      [randomUUID(), user.id, id, JSON.stringify({ firstName: parsed.firstName, lastName: parsed.lastName })],
    );

    app.log.info("Team member created", { userId: user.id, id });
    return jsonOk({ data: { id } }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("Team create error", { error: (e as Error).message, stack: (e as Error).stack });
    return jsonErrorResponse({ message: "Erreur lors de l'enregistrement", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── PUT /api/admin/team/:id ───────────────────────────────────────────────────

export const handleTeamUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const memberId = ctx.params.id;
  if (!memberId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = memberUpdateSchema.parse(body);

    const existing = await app.db.sql`SELECT * FROM team_members WHERE id = ${memberId} AND deleted_at IS NULL`;
    if (!existing) {
      return jsonErrorResponse({ message: "Membre non trouvé", code: "NOT_FOUND" }, 404);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.firstName !== undefined) { updates.push(`first_name = $${idx++}`); values.push(parsed.firstName); }
    if (parsed.lastName !== undefined) { updates.push(`last_name = $${idx++}`); values.push(parsed.lastName); }
    if (parsed.role !== undefined) { updates.push(`role = $${idx++}`); values.push(parsed.role); }
    if (parsed.bio !== undefined) { updates.push(`bio = $${idx++}`); values.push(parsed.bio); }
    if (parsed.photoMediaId !== undefined) { updates.push(`photo_media_id = $${idx++}`); values.push(parsed.photoMediaId); }
    if (parsed.sortOrder !== undefined) { updates.push(`sort_order = $${idx++}`); values.push(parsed.sortOrder); }

    updates.push(`updated_at = NOW()`);
    values.push(memberId);

    await app.db.sql.unsafe(
      `UPDATE team_members SET ${updates.join(", ")} WHERE id = $${idx}`,
      values,
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'team_member', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, memberId, JSON.stringify(existing), JSON.stringify(parsed)],
    );

    app.log.info("Team member updated", { userId: user.id, id: memberId });
    return jsonOk({ message: "Membre modifié" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── DELETE /api/admin/team/:id ────────────────────────────────────────────────

export const handleTeamDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const memberId = ctx.params.id;
  if (!memberId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`SELECT * FROM team_members WHERE id = ${memberId} AND deleted_at IS NULL`;
  if (!existing) {
    return jsonErrorResponse({ message: "Membre non trouvé", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`UPDATE team_members SET deleted_at = NOW() WHERE id = ${memberId}`;

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'team_member', $3, $4, NOW())`,
    [randomUUID(), user.id, memberId, JSON.stringify({ firstName: (existing as any[])[0]?.first_name, lastName: (existing as any[])[0]?.last_name })],
  );

  app.log.info("Team member deleted", { userId: user.id, id: memberId });
  return jsonOk({ message: "Membre supprimé" });
};
