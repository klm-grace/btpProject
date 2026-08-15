/**
 * Handlers Leads — Gestion des demandes de contact et de devis.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { isValidUUID } from "../utils/validate";
import { getAppContext } from "../utils/context";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const statusUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "converted", "archived"]),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapDbError(error: unknown): { code: string; message: string } {
  const msg = (error as Error).message ?? "";
  return { code: "VALIDATION_ERROR", message: "Erreur lors de l'enregistrement" };
}

// ── GET /api/admin/contacts ────────────────────────────────────────────────────

export const handleContactList: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "leads.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const url = new URL(req.url);
  const pageToken = url.searchParams.get("cursor") as string | null;
  const status = url.searchParams.get("status") as string | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);

  // Decode cursor
  const pagination = pageToken ? await app.pagination.decodeCursor(pageToken) : { value: "", id: "" };
  if ("code" in pagination) {
    return jsonErrorResponse({ message: "Cursor invalide", code: "INVALID_CURSOR" }, 400);
  }

  const whereClause = status ? `WHERE status = $1` : "";
  const params: unknown[] = status ? [status] : [];
  const cursorVal = pagination.value ? [pagination.value, pagination.id, ...params] : params;
  const cursorSql = pagination.value
    ? `WHERE (created_at, id) < ($1, $2) ${whereClause ? "AND " + whereClause.replace("WHERE ", "") : ""}`
    : whereClause;
  const cursorParams: unknown[] = pagination.value
    ? [pagination.value, pagination.id, ...(status ? [status] : [])]
    : [...(status ? [status] : [])];

  try {
    const rows = await app.db.sql.unsafe(
      `SELECT id, name, email, phone, subject, LEFT(message, 200) AS message_preview,
              status, notes, created_at, updated_at
       FROM contact_requests
       ${cursorSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${cursorParams.length + 1}`,
      [...cursorParams, limit + 1],
    );

    const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const nextCursor = hasMore && rows[limit] ? app.pagination.getNextCursor(rows[limit] as { created_at: string; id: string }) : null;

  return jsonOk({
    data,
    meta: { nextCursor, hasMore },
  });
  } catch (e: unknown) {
    app.log.error("Contact list error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── GET /api/admin/contacts/:id ───────────────────────────────────────────────

export const handleContactGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "leads.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const contactId = ctx.params.id;
  if (!contactId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }
  if (!isValidUUID(contactId)) {
    return jsonErrorResponse({ message: "Format d'identifiant invalide", code: "INVALID_UUID" }, 400);
  }

  try {
    const row = await app.db.sql.unsafe(
      `SELECT * FROM contact_requests WHERE id = $1`,
      [contactId],
    );

    if (!row || row.length === 0) {
      return jsonErrorResponse({ message: "Demande non trouvée", code: "NOT_FOUND" }, 404);
    }

    return jsonOk({ data: row[0] });
  } catch (e: unknown) {
    app.log.error("Contact get error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── PUT /api/admin/contacts/:id ───────────────────────────────────────────────

export const handleContactUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "leads.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const contactId = ctx.params.id;
  if (!contactId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = statusUpdateSchema.parse(body);

    const existing = await app.db.sql.unsafe(
      `SELECT * FROM contact_requests WHERE id = $1`,
      [contactId],
    );
    if (!existing || existing.length === 0) {
      return jsonErrorResponse({ message: "Demande non trouvée", code: "NOT_FOUND" }, 404);
    }

    const existingRow = existing[0] as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.status !== undefined) { updates.push(`status = $${idx++}`); values.push(parsed.status); }
    if (parsed.notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(parsed.notes); }
    updates.push(`updated_at = NOW()`);

    values.push(contactId);
    await app.db.sql.unsafe(
      `UPDATE contact_requests SET ${updates.join(", ")} WHERE id = $${values.length}`,
      values,
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'contact_request', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, contactId, JSON.stringify(existingRow), JSON.stringify(parsed)],
    );

    app.log.info("Contact updated", { userId: user.id, id: contactId, status: parsed.status });
    return jsonOk({ message: "Demande mise à jour" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("Contact update error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── GET /api/admin/quotes ─────────────────────────────────────────────────────

export const handleQuoteList: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "leads.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const url = new URL(req.url);
  const pageToken = url.searchParams.get("cursor") as string | null;
  const status = url.searchParams.get("status") as string | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);

  const pagination = pageToken ? await app.pagination.decodeCursor(pageToken) : { value: "", id: "" };
  if ("code" in pagination) {
    return jsonErrorResponse({ message: "Cursor invalide", code: "INVALID_CURSOR" }, 400);
  }

  const cursorSql = pagination.value
    ? `WHERE (created_at, id) < ($1, $2) ${status ? "AND status = $3" : ""}`
    : status ? `WHERE status = $1` : "";
  const cursorParams: unknown[] = pagination.value
    ? [pagination.value, pagination.id, ...(status ? [status] : [])]
    : [...(status ? [status] : [])];

  try {
    const rows = await app.db.sql.unsafe(
      `SELECT id, name, email, phone, company, project_type, budget_range, LEFT(description, 200) AS description_preview,
              status, notes, created_at, updated_at
       FROM quote_requests
       ${cursorSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${cursorParams.length + 1}`,
      [...cursorParams, limit + 1],
    );

    const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const nextCursor = hasMore && rows[limit] ? app.pagination.getNextCursor(rows[limit] as { created_at: string; id: string }) : null;

  return jsonOk({
    data,
    meta: { nextCursor, hasMore },
  });
  } catch (e: unknown) {
    app.log.error("Quote list error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── GET /api/admin/quotes/:id ─────────────────────────────────────────────────

export const handleQuoteGet: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "leads.read");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const quoteId = ctx.params.id;
  if (!quoteId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }
  if (!isValidUUID(quoteId)) {
    return jsonErrorResponse({ message: "Format d'identifiant invalide", code: "INVALID_UUID" }, 400);
  }

  try {
    const row = await app.db.sql.unsafe(
      `SELECT * FROM quote_requests WHERE id = $1`,
      [quoteId],
    );

    if (!row || row.length === 0) {
      return jsonErrorResponse({ message: "Demande non trouvée", code: "NOT_FOUND" }, 404);
    }

    return jsonOk({ data: row[0] });
  } catch (e: unknown) {
    app.log.error("Quote get error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};

// ── PUT /api/admin/quotes/:id ─────────────────────────────────────────────────

export const handleQuoteUpdate: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "leads.write");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const quoteId = ctx.params.id;
  if (!quoteId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = statusUpdateSchema.parse(body);

    const existing = await app.db.sql.unsafe(
      `SELECT * FROM quote_requests WHERE id = $1`,
      [quoteId],
    );
    if (!existing || existing.length === 0) {
      return jsonErrorResponse({ message: "Demande non trouvée", code: "NOT_FOUND" }, 404);
    }

    const existingRow = existing[0] as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.status !== undefined) { updates.push(`status = $${idx++}`); values.push(parsed.status); }
    if (parsed.notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(parsed.notes); }
    updates.push(`updated_at = NOW()`);

    values.push(quoteId);
    await app.db.sql.unsafe(
      `UPDATE quote_requests SET ${updates.join(", ")} WHERE id = $${values.length}`,
      values,
    );

    await app.db.sql.unsafe(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, $2, 'update', 'quote_request', $3, $4, $5, NOW())`,
      [randomUUID(), user.id, quoteId, JSON.stringify(existingRow), JSON.stringify(parsed)],
    );

    app.log.info("Quote updated", { userId: user.id, id: quoteId, status: parsed.status });
    return jsonOk({ message: "Demande mise à jour" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("Quote update error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur lors de la mise à jour", code: "INTERNAL_ERROR" }, 500);
  }
};
