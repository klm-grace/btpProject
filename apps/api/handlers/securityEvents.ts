/**
 * Handlers Security Events — Gestion des événements de sécurité.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { logLoginAttempt, logForbiddenAccess, logIntrusionAttempt } from "../utils/logger-helpers";
import { isValidUUID } from "../utils/validate";
import { getAppContext } from "../utils/context";
import { z } from "zod";

const flagUserSchema = z.object({
  note: z.string().max(500).optional().nullable(),
  suspicious: z.boolean().optional(),
});

// ── GET /api/admin/security-events ────────────────────────────────────────────

export const handleSecurityEventList: RouteHandler = async (req, ctx) => {
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
  const eventType = url.searchParams.get("eventType") as string | null;
  const userId = url.searchParams.get("userId") as string | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const query: any = { limit, offset };
  if (eventType) query.eventType = eventType;
  if (userId) query.userIds = [userId];

  const events = await app.securityEvents.getEvents(query);

  // Log security event access
  app.log.info("Security events accessed", {
    userId: user.id,
    filters: { eventType, userId: url.searchParams.get("userId") },
    ip: app.trustedProxy.getClientIp(req),
  });

  return jsonOk({ data: events, meta: { limit, offset } });
};

// ── PUT /api/admin/users/:id/flag ─────────────────────────────────────────────

export const handleFlagUser: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const permCheck = await app.rbac.checkPermission(user, "settings.manage");
  if (!permCheck.allowed) {
    return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
  }

  const targetUserId = ctx.params.id;
  if (!targetUserId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  // Validate UUID format to prevent SQL errors
  if (!isValidUUID(targetUserId)) {
    return jsonErrorResponse({ message: "Format d\'identifiant invalide", code: "INVALID_UUID" }, 400);
  }

  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = flagUserSchema.parse(body);

    // Vérifier que l'utilisateur existe
    const existing = await app.db.sql.unsafe(
      `SELECT id, suspicious_note, status FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [targetUserId],
    );
    if (!existing || existing.length === 0) {
      return jsonErrorResponse({ message: "Utilisateur non trouvé", code: "NOT_FOUND" }, 404);
    }

    const updateUser = existing[0] as any;
    const newSuspicious = parsed.suspicious ?? updateUser.suspicious_note !== null;
    const newNote = parsed.note ?? updateUser.suspicious_note;

    await app.db.sql.unsafe(
      `UPDATE users SET suspicious_note = $1, updated_at = NOW() WHERE id = $2`,
      [newNote ?? null, targetUserId],
    );

    // Logger l'événement
    await app.securityEvents.recordEvent({
      userId: user.id,
      eventType: newSuspicious ? "account_flagged" : "account_unflagged",
      details: { targetUserId, note: newNote },
    });

    app.log.info("User flagged", { userId: user.id, targetUserId, suspicious: newSuspicious });
    app.log.security("User flagged/unflagged", {
      action: newSuspicious ? "flagged" : "unflagged",
      adminUserId: user.id,
      targetUserId,
      note: newNote,
      ip: app.trustedProxy.getClientIp(req),
    });
    return jsonOk({ message: newSuspicious ? "Utilisateur flaggé" : "Utilisateur déflaggé" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonErrorResponse({ message: "Données invalides", code: "VALIDATION_ERROR" }, 400);
    }
    app.log.error("Flag user error", { error: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "INTERNAL_ERROR" }, 500);
  }
};
