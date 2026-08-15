/**
 * Handlers Content Sections — Sections éditoriales.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const sectionCreateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
  title: z.string().min(1).max(200),
  body: z.record(z.string(), z.any()).default({}),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const sectionUpdateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide").optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.record(z.string(), z.any()).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapDbError(error: unknown): { code: string; message: string } {
  const msg = (error as Error).message ?? "";
  if (msg.includes("Unique constraint")) return { code: "SLUG_CONFLICT", message: "Ce slug existe déjà" };
  if (msg.includes("slug")) return { code: "INVALID_SLUG", message: "Slug invalide" };
  return { code: "VALIDATION_ERROR", message: "Erreur lors de l'enregistrement" };
}

// ── GET /api/admin/content-sections ───────────────────────────────────────────

export const handleContentSectionList: RouteHandler = async (req, ctx) => {
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
  const status = url.searchParams.get("status") as "draft" | "published" | "archived" | null;

  const whereClause = status ? `WHERE status = $1 AND deleted_at IS NULL` : `WHERE deleted_at IS NULL`;
  const params: unknown[] = status ? [status] : [];

  const rows = await app.db.sql.unsafe(
    `SELECT id, slug, title, body, status, version, created_at, updated_at
     FROM content_sections ${whereClause}
     ORDER BY slug ASC`,
    params,
  );

  return jsonOk({ data: rows });
};

// ── GET /api/admin/content-sections/:slug ────────────────────────────────────

export const handleContentSectionGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const slug = ctx.params.slug;
  if (!slug) {
    return jsonErrorResponse({ message: "Slug requis", code: "MISSING_SLUG" }, 400);
  }

  const section = await app.db.sql.unsafe(
    `SELECT id, slug, title, body, status, version, created_at, updated_at
     FROM content_sections
     WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );

  if (!section || section.length === 0) {
    return jsonErrorResponse({ message: "Section non trouvée", code: "NOT_FOUND" }, 404);
  }

  return jsonOk({ data: section[0] });
};

// ── POST /api/admin/content-sections ──────────────────────────────────────────

export const handleContentSectionCreate: RouteHandler = async (req, ctx) => {
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
    const parsed = sectionCreateSchema.parse(body);
    const id = randomUUID();

    await app.db.sql.unsafe(
      `INSERT INTO content_sections (id, slug, title, body, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())`,
      [id, parsed.slug, parsed.title, JSON.stringify(parsed.body), parsed.status],
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'create', 'content_section', $3, $4, NOW())`,
      [randomUUID(), user.id, id, JSON.stringify({ slug: parsed.slug, title: parsed.title })],
    );

    app.log.info("Content section created", { userId: user.id, slug: parsed.slug });
    return jsonOk({ data: { id, slug: parsed.slug } }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── PUT /api/admin/content-sections/:slug ─────────────────────────────────────

export const handleContentSectionUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const slug = ctx.params.slug;
  if (!slug) {
    return jsonErrorResponse({ message: "Slug requis", code: "MISSING_SLUG" }, 400);
  }

  try {
    const body = await req.json();
    const parsed = sectionUpdateSchema.parse(body);

    const existing = await app.db.sql.unsafe(
      `SELECT * FROM content_sections WHERE slug = $1 AND deleted_at IS NULL`,
      [slug],
    );
    if (!existing || existing.length === 0) {
      return jsonErrorResponse({ message: "Section non trouvée", code: "NOT_FOUND" }, 404);
    }

    const existingRow = existing[0];
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.slug !== undefined) { updates.push(`slug = $${idx++}`); values.push(parsed.slug); }
    if (parsed.title !== undefined) { updates.push(`title = $${idx++}`); values.push(parsed.title); }
    if (parsed.body !== undefined) { updates.push(`body = $${idx++}`); values.push(JSON.stringify(parsed.body)); }
    if (parsed.status !== undefined) { updates.push(`status = $${idx++}`); values.push(parsed.status); }

    updates.push(`version = version + 1, updated_at = NOW()`);
    values.push(slug);

    await app.db.sql.unsafe(
      `UPDATE content_sections SET ${updates.join(", ")} WHERE slug = $${idx}`,
      values,
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'content_section', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, existingRow!.id, JSON.stringify(existingRow), JSON.stringify(parsed)],
    );

    app.log.info("Content section updated", { userId: user.id, slug });
    return jsonOk({ message: "Section modifiée" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── DELETE /api/admin/content-sections/:slug ──────────────────────────────────

export const handleContentSectionDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const slug = ctx.params.slug;
  if (!slug) {
    return jsonErrorResponse({ message: "Slug requis", code: "MISSING_SLUG" }, 400);
  }

  const existing = await app.db.sql.unsafe(
    `SELECT * FROM content_sections WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  if (!existing || existing.length === 0) {
    return jsonErrorResponse({ message: "Section non trouvée", code: "NOT_FOUND" }, 404);
  }

  const existingRow = existing[0];
  await app.db.sql.unsafe(`UPDATE content_sections SET deleted_at = NOW() WHERE slug = $1`, [slug]);

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'content_section', $3, $4, NOW())`,
    [randomUUID(), user.id, existingRow!.id, JSON.stringify({ slug: existingRow!.slug, title: existingRow!.title })],
  );

  app.log.info("Content section deleted", { userId: user.id, slug });
  return jsonOk({ message: "Section supprimée" });
};
