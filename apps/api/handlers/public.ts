/**
 * Handlers pour les formulaires publics (contact, devis).
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { readJsonBody } from "../utils/body";
import { getAppContext } from "../utils/context";
import { z } from "zod";

/** Longueur max des champs texte (message, description). */
export const PUBLIC_TEXT_MAX = 2500;

const ContactSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100),
  email: z.string().email("Email invalide").max(254),
  phone: z.string().max(30).optional().nullable(),
  subject: z.string().max(200).optional().nullable(),
  message: z.string().min(1, "Le message est requis").max(PUBLIC_TEXT_MAX),
  // Honeypot : ces champs doivent être vides (les bots les remplissent)
  website: z.string().max(0).optional(),
  url: z.string().max(0).optional(),
  // Consentement RGPD
  consent: z.boolean().refine((v) => v === true, { message: "Le consentement est requis" }),
});

const QuoteSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100),
  email: z.string().email("Email invalide").max(254),
  phone: z.string().max(30).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  projectType: z.string().max(100).optional().nullable(),
  budgetRange: z.string().max(50).optional().nullable(),
  description: z.string().min(1, "La description est requise").max(PUBLIC_TEXT_MAX),
  website: z.string().max(0).optional(),
  url: z.string().max(0).optional(),
  consent: z.boolean().refine((v) => v === true, { message: "Le consentement est requis" }),
});

/**
 * POST /api/public/contact
 */
export const handleContactSubmit: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const body = await readJsonBody(req);
    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      return jsonErrorResponse({ message: "Invalid request body", code: "INVALID_BODY" }, 400);
    }

    const { name, email, phone, subject, message, consent } = parsed.data;

    // Insérer en base
    const now = new Date().toISOString();
    await app.db.sql.unsafe(
      `INSERT INTO contact_requests (name, email, phone, subject, message, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'new', $6, $7)`,
      [name, email, phone ?? null, subject ?? null, message, now, now],
    );

    // Outbox email de confirmation
    await app.outbox.enqueue("email", {
      recipient: email,
      subject: subject ?? "Votre message nous est parvenu",
      payload: { name, message, consent, consentVersion: app.config.consentVersion, ip: app.trustedProxy.getClientIp(req) ?? undefined },
    });

    app.log.info("Contact form submitted", { email, consent });
    return jsonOk({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "invalid_json_body") {
      return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    }
    app.log.error("Contact submit error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * POST /api/public/quote
 */
export const handleQuoteSubmit: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const body = await readJsonBody(req);
    const parsed = QuoteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonErrorResponse({ message: "Invalid request body", code: "INVALID_BODY" }, 400);
    }

    const { name, email, phone, company, projectType, budgetRange, description, consent } = parsed.data;

    // Insérer en base
    const now = new Date().toISOString();
    await app.db.sql.unsafe(
      `INSERT INTO quote_requests (name, email, phone, company, project_type, budget_range, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9)`,
      [name, email, phone ?? null, company ?? null, projectType ?? null, budgetRange ?? null, description, now, now],
    );

    // Outbox email interne
    await app.outbox.enqueue("email", {
      recipient: email,
      subject: "Demande de devis — accusé de réception",
      payload: { name, company, projectType, budgetRange, description, consent, consentVersion: app.config.consentVersion },
    });

    // Outbox notification équipe
    await app.outbox.enqueue("email", {
      recipient: "admin@btp-dev.local",
      subject: `Nouvelle demande de devis de ${name}`,
      payload: { name, email, phone, company, projectType, budgetRange, description },
    });

    app.log.info("Quote form submitted", { email });
    return jsonOk({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "invalid_json_body") {
      return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    }
    app.log.error("Quote submit error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};
