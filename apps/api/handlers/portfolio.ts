/**
 * Handlers Portfolio — Catégories et Réalisations.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide (minuscules, tirets uniquement)"),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

const categoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide").optional(),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

const projectCreateSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 10).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  categoryIds: z.array(z.string().uuid()).optional(),
});

const projectUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide").optional(),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 10).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapDbError(error: unknown): { code: string; message: string } {
  const msg = (error as Error).message ?? "";
  if (msg.includes("Unique constraint")) return { code: "SLUG_CONFLICT", message: "Ce slug existe déjà" };
  if (msg.includes("slug")) return { code: "INVALID_SLUG", message: "Slug invalide" };
  return { code: "VALIDATION_ERROR", message: "Erreur lors de l'enregistrement" };
}

// ── GET /api/admin/categories ─────────────────────────────────────────────────

export const handleCategoryList: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  // Vérifier la permission
  const permCheck = await app.rbac.checkPermission(user, "portfolio.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1") || 1;
  const limit = parseInt(url.searchParams.get("limit") ?? "20") || 20;
  const offset = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    app.db.sql`
      SELECT c.id, c.name, c.slug, c.description, c.sort_order, c.created_at, c.updated_at
      FROM categories c
      ORDER BY c.sort_order ASC, c.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    app.db.sql`SELECT COUNT(*)::int AS count FROM categories`,
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

// ── POST /api/admin/categories ────────────────────────────────────────────────

export const handleCategoryCreate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = categoryCreateSchema.parse(body);

    await app.db.sql.unsafe(
      `INSERT INTO categories (id, name, slug, description, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [randomUUID(), parsed.name, parsed.slug, parsed.description ?? null, parsed.sortOrder],
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'create', 'category', $3, $4, NOW())`,
      [randomUUID(), user.id, parsed.slug, JSON.stringify({ name: parsed.name })],
    );

    app.log.info("Category created", { userId: user.id, slug: parsed.slug });
    return jsonOk({ message: "Catégorie créée" }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── PUT /api/admin/categories/:id ────────────────────────────────────────────

export const handleCategoryUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const categoryId = ctx.params.id;
  if (!categoryId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = categoryUpdateSchema.parse(body);

    const existing = await app.db.sql`
      SELECT id, name, slug, description, sort_order FROM categories WHERE id = ${categoryId}
    `;
    if (existing.length === 0) {
      return jsonErrorResponse({ message: "Catégorie non trouvée", code: "NOT_FOUND" }, 404);
    }

    const oldData = { name: existing[0]!.name, slug: existing[0]!.slug, sortOrder: existing[0]!.sort_order };

    await app.db.sql.unsafe(
      `UPDATE categories
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           description = COALESCE($3, description),
           sort_order = COALESCE($4, sort_order),
           updated_at = NOW()
       WHERE id = $5`,
      [parsed.name ?? null, parsed.slug ?? null, parsed.description ?? null, parsed.sortOrder ?? null, categoryId],
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'category', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, categoryId, JSON.stringify(oldData), JSON.stringify(parsed)],
    );

    app.log.info("Category updated", { userId: user.id, categoryId });
    return jsonOk({ message: "Catégorie mise à jour" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── DELETE /api/admin/categories/:id ─────────────────────────────────────────

export const handleCategoryDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const categoryId = ctx.params.id;
  if (!categoryId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`
    SELECT id, name, slug FROM categories WHERE id = ${categoryId}
  `;
  if (existing.length === 0) {
    return jsonErrorResponse({ message: "Catégorie non trouvée", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`DELETE FROM categories WHERE id = ${categoryId}`;

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'category', $3, $4, NOW())`,
    [randomUUID(), user.id, categoryId, JSON.stringify({ name: existing[0]!.name, slug: existing[0]!.slug })],
  );

  app.log.info("Category deleted", { userId: user.id, categoryId });
  return jsonOk({ message: "Catégorie supprimée" });
};

// ── GET /api/admin/projects ──────────────────────────────────────────────────

export const handleProjectList: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1") || 1;
  const limit = parseInt(url.searchParams.get("limit") ?? "20") || 20;
  const offset = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    app.db.sql.unsafe(`
      SELECT p.id, p.title, p.slug, p.description, p.location, p.year, p.status,
             p.created_at, p.updated_at
      FROM projects p
      WHERE p.deleted_at IS NULL
      ORDER BY p.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    app.db.sql.unsafe(`SELECT COUNT(*)::int AS count FROM projects WHERE deleted_at IS NULL`),
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

// ── GET /api/admin/projects/:id ──────────────────────────────────────────────

export const handleProjectGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const project = await app.db.sql`
    SELECT p.id, p.title, p.slug, p.description, p.location, p.year, p.status, p.version,
           p.created_at, p.updated_at
    FROM projects p
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
    LIMIT 1
  `;

  if (project.length === 0) {
    return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
  }

  const categories = await app.db.sql`
    SELECT c.id, c.name, c.slug
    FROM categories c
    JOIN project_categories pc ON pc.category_id = c.id
    WHERE pc.project_id = ${projectId}
  `;

  const images = await app.db.sql`
    SELECT pi.id, pi.media_id, pi.sort_order, pi.is_cover, m.original_name, m.mime_type
    FROM project_images pi
    JOIN media m ON m.id = pi.media_id
    WHERE pi.project_id = ${projectId}
    ORDER BY pi.sort_order ASC
  `;

  return jsonOk({
    data: {
      ...project[0]!,
      categories: categories.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
      images: images.map((img: any) => ({
        id: img.id,
        mediaId: img.media_id,
        sortOrder: img.sort_order,
        isCover: img.is_cover,
        originalName: img.original_name,
        mimeType: img.mime_type,
      })),
    },
  });
};

// ── POST /api/admin/projects ─────────────────────────────────────────────────

export const handleProjectCreate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = projectCreateSchema.parse(body);
    const projectId = randomUUID();

    await app.db.sql.unsafe(`BEGIN`);
    try {
      await app.db.sql.unsafe(
        `INSERT INTO projects (id, title, slug, description, location, year, status, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())`,
        [projectId, parsed.title, parsed.slug, parsed.description ?? null, parsed.location ?? null, parsed.year ?? null, parsed.status],
      );

      if (parsed.categoryIds && parsed.categoryIds.length > 0) {
        for (const catId of parsed.categoryIds) {
          await app.db.sql.unsafe(
            `INSERT INTO project_categories (project_id, category_id) VALUES ($1, $2)`,
            [projectId, catId],
          );
        }
      }

      await app.db.sql.unsafe(`COMMIT`);
    } catch (txErr) {
      await app.db.sql.unsafe(`ROLLBACK`);
      throw txErr;
    }

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, $2, 'create', 'project', $3, $4, NOW())`,
      [randomUUID(), user.id, projectId, JSON.stringify({ title: parsed.title, slug: parsed.slug, status: parsed.status })],
    );

    app.log.info("Project created", { userId: user.id, projectId });
    return jsonOk({ id: projectId, message: "Projet créé" }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── PUT /api/admin/projects/:id ──────────────────────────────────────────────

export const handleProjectUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = projectUpdateSchema.parse(body);

    const existing = await app.db.sql`
      SELECT id, title, slug, description, location, year, status, version
      FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
    `;
    if (existing.length === 0) {
      return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
    }

    const oldData = {
      title: existing[0]!.title,
      slug: existing[0]!.slug,
      status: existing[0]!.status,
      version: existing[0]!.version,
    };

    await app.db.sql.unsafe(`BEGIN`);
    try {
      await app.db.sql.unsafe(
        `UPDATE projects
         SET title = COALESCE($1, title),
             slug = COALESCE($2, slug),
             description = COALESCE($3, description),
             location = COALESCE($4, location),
             year = COALESCE($5, year),
             status = COALESCE($6, status),
             version = version + 1,
             updated_at = NOW()
         WHERE id = $7`,
        [parsed.title ?? null, parsed.slug ?? null, parsed.description ?? null, 
         parsed.location ?? null, parsed.year ?? null, parsed.status ?? null, projectId],
      );

      if (parsed.categoryIds !== undefined) {
        await app.db.sql.unsafe(
          `DELETE FROM project_categories WHERE project_id = $1`,
          [projectId],
        );
        if (parsed.categoryIds.length > 0) {
          for (const catId of parsed.categoryIds) {
            await app.db.sql.unsafe(
              `INSERT INTO project_categories (project_id, category_id) VALUES ($1, $2)`,
              [projectId, catId],
            );
          }
        }
      }

      await app.db.sql.unsafe(`COMMIT`);
    } catch (txErr) {
      await app.db.sql.unsafe(`ROLLBACK`);
      throw txErr;
    }

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'project', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, projectId, JSON.stringify(oldData), JSON.stringify(parsed)],
    );

    app.log.info("Project updated", { userId: user.id, projectId });
    return jsonOk({ message: "Projet mis à jour" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    const dbErr = mapDbError(e);
    return jsonErrorResponse({ message: dbErr.message, code: dbErr.code }, 409);
  }
};

// ── DELETE /api/admin/projects/:id ───────────────────────────────────────────

export const handleProjectDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`
    SELECT id, title, slug FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
  `;
  if (existing.length === 0) {
    return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`
    UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${projectId}
  `;

  await app.db.sql.unsafe(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, created_at)
     VALUES ($1, $2, 'delete', 'project', $3, $4, NOW())`,
    [randomUUID(), user.id, projectId, JSON.stringify({ title: existing[0]!.title, slug: existing[0]!.slug })],
  );

  app.log.info("Project deleted", { userId: user.id, projectId });
  return jsonOk({ message: "Projet supprimé" });
};

// ── POST /api/admin/projects/:id/publish ─────────────────────────────────────

export const handleProjectPublish: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`
    SELECT id, status FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
  `;
  if (existing.length === 0) {
    return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`
    UPDATE projects SET status = 'published', updated_at = NOW() WHERE id = ${projectId}
  `;

  app.log.info("Project published", { userId: user.id, projectId });
  return jsonOk({ message: "Projet publié" });
};

// ── POST /api/admin/projects/:id/unpublish ───────────────────────────────────

export const handleProjectUnpublish: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`
    SELECT id, status FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
  `;
  if (existing.length === 0) {
    return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`
    UPDATE projects SET status = 'draft', updated_at = NOW() WHERE id = ${projectId}
  `;

  app.log.info("Project unpublished", { userId: user.id, projectId });
  return jsonOk({ message: "Projet dépublié" });
};

// ── POST /api/admin/projects/:id/images ──────────────────────────────────────

export const handleProjectAddImage: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const { mediaId, sortOrder = 0, isCover = false } = z.object({
      mediaId: z.string().uuid(),
      sortOrder: z.number().int().min(0).default(0),
      isCover: z.boolean().default(false),
    }).parse(body);

    const project = await app.db.sql`SELECT id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL`;
    if (project.length === 0) {
      return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
    }

    const media = await app.db.sql`SELECT id FROM media WHERE id = ${mediaId}`;
    if (media.length === 0) {
      return jsonErrorResponse({ message: "Média non trouvé", code: "NOT_FOUND" }, 404);
    }

    await app.db.sql.unsafe(`BEGIN`);
    try {
      await app.db.sql.unsafe(
        `INSERT INTO project_images (id, project_id, media_id, sort_order, is_cover, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [randomUUID(), projectId, mediaId, sortOrder, isCover],
      );
      await app.db.sql.unsafe(`COMMIT`);
    } catch (txErr) {
      await app.db.sql.unsafe(`ROLLBACK`);
      throw txErr;
    }

    app.log.info("Project image added", { userId: user.id, projectId, mediaId });
    return jsonOk({ message: "Image ajoutée" }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    return jsonErrorResponse({ message: "Erreur", code: "ERROR" }, 500);
  }
};

// ── PUT /api/admin/projects/:id/images/:imageId ─────────────────────────────

export const handleProjectUpdateImage: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const { id: projectId, imageId } = ctx.params;
  if (!projectId || !imageId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const { sortOrder, isCover } = z.object({
      sortOrder: z.number().int().min(0).optional(),
      isCover: z.boolean().optional(),
    }).parse(body);

    const existing = await app.db.sql`
      SELECT id FROM project_images WHERE id = ${imageId} AND project_id = ${projectId}
    `;
    if (existing.length === 0) {
      return jsonErrorResponse({ message: "Image non trouvée", code: "NOT_FOUND" }, 404);
    }

    await app.db.sql.unsafe(
      `UPDATE project_images
       SET sort_order = COALESCE($1, sort_order),
           is_cover = COALESCE($2, is_cover)
       WHERE id = $3`,
      [sortOrder ?? null, isCover ?? null, imageId],
    );

    app.log.info("Project image updated", { userId: user.id, projectId, imageId });
    return jsonOk({ message: "Image mise à jour" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    return jsonErrorResponse({ message: "Erreur", code: "ERROR" }, 500);
  }
};

// ── DELETE /api/admin/projects/:id/images/:imageId ──────────────────────────

export const handleProjectDeleteImage: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const { id: projectId, imageId } = ctx.params;
  if (!projectId || !imageId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`
    SELECT id FROM project_images WHERE id = ${imageId} AND project_id = ${projectId}
  `;
  if (existing.length === 0) {
    return jsonErrorResponse({ message: "Image non trouvée", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`DELETE FROM project_images WHERE id = ${imageId}`;

  app.log.info("Project image deleted", { userId: user.id, projectId, imageId });
  return jsonOk({ message: "Image supprimée" });
};

// ── POST /api/admin/projects/:id/categories ─────────────────────────────────

export const handleProjectAddCategory: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const projectId = ctx.params.id;
  if (!projectId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const { categoryId } = z.object({
      categoryId: z.string().uuid(),
    }).parse(body);

    const project = await app.db.sql`SELECT id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL`;
    if (project.length === 0) {
      return jsonErrorResponse({ message: "Projet non trouvé", code: "NOT_FOUND" }, 404);
    }

    const category = await app.db.sql`SELECT id FROM categories WHERE id = ${categoryId}`;
    if (category.length === 0) {
      return jsonErrorResponse({ message: "Catégorie non trouvée", code: "NOT_FOUND" }, 404);
    }

    const existing = await app.db.sql`
      SELECT id FROM project_categories WHERE project_id = ${projectId} AND category_id = ${categoryId}
    `;
    if (existing.length > 0) {
      return jsonErrorResponse({ message: "Catégorie déjà associée", code: "CONFLICT" }, 409);
    }

    await app.db.sql.unsafe(
      `INSERT INTO project_categories (project_id, category_id) VALUES ($1, $2)`,
      [projectId, categoryId],
    );

    app.log.info("Project category added", { userId: user.id, projectId, categoryId });
    return jsonOk({ message: "Catégorie ajoutée" }, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    return jsonErrorResponse({ message: "Erreur", code: "ERROR" }, 500);
  }
};

// ── DELETE /api/admin/projects/:id/categories/:categoryId ───────────────────

export const handleProjectDeleteCategory: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "portfolio.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const { id: projectId, categoryId } = ctx.params;
  if (!projectId || !categoryId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  const existing = await app.db.sql`
    SELECT id FROM project_categories WHERE project_id = ${projectId} AND category_id = ${categoryId}
  `;
  if (existing.length === 0) {
    return jsonErrorResponse({ message: "Association non trouvée", code: "NOT_FOUND" }, 404);
  }

  await app.db.sql`DELETE FROM project_categories WHERE project_id = ${projectId} AND category_id = ${categoryId}`;

  app.log.info("Project category removed", { userId: user.id, projectId, categoryId });
  return jsonOk({ message: "Catégorie retirée" });
};
