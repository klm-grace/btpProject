/**
 * Handlers Company Profile — Informations entreprise.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const companyUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tagline: z.string().max(300).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Email invalide").optional().nullable(),
  website: z.string().url("URL invalide").optional().nullable(),
  socialLinks: z.record(z.string(), z.string()).optional().nullable(),
});

// ── GET /api/admin/company ───────────────────────────────────────────────────

export const handleGetCompanyProfile: RouteHandler = async (_req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "content.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const profile = await app.db.sql`
    SELECT id, name, tagline, description, address, phone, email, website, social_links
    FROM company_profile
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return jsonOk({ data: profile ?? null });
};

// ── PUT /api/admin/company ───────────────────────────────────────────────────

export const handleUpdateCompanyProfile: RouteHandler = async (req, ctx) => {
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
    const parsed = companyUpdateSchema.parse(body);

    // Get existing profile
    const existingRows = await app.db.sql`
      SELECT id, name, tagline, description, address, phone, email, website, social_links
      FROM company_profile
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const existingRow = existingRows && existingRows.length > 0 ? (existingRows[0] as { id: string; name: string; tagline: string | null; description: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; social_links: unknown }) : null;
    const existingId = existingRow?.id ?? null;

    let newId: string;
    if (existingId) {
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (parsed.name !== undefined) { updates.push(`name = $${idx++}`); values.push(parsed.name); }
      if (parsed.tagline !== undefined) { updates.push(`tagline = $${idx++}`); values.push(parsed.tagline); }
      if (parsed.description !== undefined) { updates.push(`description = $${idx++}`); values.push(parsed.description); }
      if (parsed.address !== undefined) { updates.push(`address = $${idx++}`); values.push(parsed.address); }
      if (parsed.phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(parsed.phone); }
      if (parsed.email !== undefined) { updates.push(`email = $${idx++}`); values.push(parsed.email); }
      if (parsed.website !== undefined) { updates.push(`website = $${idx++}`); values.push(parsed.website); }
      if (parsed.socialLinks !== undefined) { updates.push(`social_links = $${idx++}`); values.push(JSON.stringify(parsed.socialLinks)); }

      updates.push(`updated_at = NOW()`);
      values.push(existingId);

      await app.db.sql.unsafe(`UPDATE company_profile SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
      newId = existingId;
    } else {
      newId = randomUUID();
      await app.db.sql.unsafe(
        `INSERT INTO company_profile (id, name, tagline, description, address, phone, email, website, social_links, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          newId,
          parsed.name ?? "Mon Entreprise",
          parsed.tagline ?? null,
          parsed.description ?? null,
          parsed.address ?? null,
          parsed.phone ?? null,
          parsed.email ?? null,
          parsed.website ?? null,
          parsed.socialLinks ? JSON.stringify(parsed.socialLinks) : null,
        ],
      );
    }

    // Audit log
    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, $3, 'company_profile', $4, $5, $6, NOW())`,
      [randomUUID(), user.id, existingId ? "update" : "create", newId, null, JSON.stringify(parsed)],
    );

    app.log.info("Company profile updated", { userId: user.id, id: newId });
    return jsonOk({ data: { id: newId } });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("Company profile update error", { error: (e as Error).message, stack: (e as Error).stack });
    app.log.error("Company profile error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};
