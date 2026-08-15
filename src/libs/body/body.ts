/**
 * body — Middleware orchestrateur multi-format.
 *
 * Ce middleware intercepte toutes les requêtes et :
 * 1. Détermine le Content-Type
 * 2. Vérifie la sécurité (chunked, taille)
 * 3. Parse le body selon le format
 * 4. Attache le résultat à ctx.state.body
 * 5. Appelle next() pour le handler
 *
 * Formats supportés :
 * - application/json
 * - application/x-www-form-urlencoded
 * - text/plain
 * - application/xml, text/xml
 * - multipart/form-data (skip, vérifie juste la taille)
 */

import type { Middleware } from "@libs/router/types";
import {
  BODY_DEFAULTS,
  type BodyMiddlewareConfig,
  type BodyContentType,
} from "./types.ts";
import { parseJsonSafe } from "./parsers/json.ts";
import { parseFormSafe, formToNested } from "./parsers/form.ts";
import { parseTextSafe } from "./parsers/text.ts";
import { parseXmlSafe } from "./parsers/xml.ts";
import { hasBody } from "./readers/stream.ts";

/** Codes d'erreur standardisés. */
const ERROR_CODES = {
  CHUNKED: "CHUNKED_ENCODING_NOT_ALLOWED",
  INVALID_CONTENT_LENGTH: "INVALID_CONTENT_LENGTH",
  BODY_TOO_LARGE: "BODY_TOO_LARGE",
  INVALID_JSON: "INVALID_JSON",
  JSON_MAX_DEPTH: "JSON_MAX_DEPTH",
  PROTOTYPE_POLLUTION: "PROTOTYPE_POLLUTION",
  INVALID_FORM: "INVALID_FORM",
  FORM_TOO_LARGE: "FORM_TOO_LARGE",
  FORM_KEY_TOO_LONG: "FORM_KEY_TOO_LONG",
  FORM_TOO_MANY_KEYS: "FORM_TOO_MANY_KEYS",
  TEXT_TOO_LARGE: "TEXT_TOO_LARGE",
  INVALID_XML: "INVALID_XML",
  XML_TOO_LARGE: "XML_TOO_LARGE",
  XML_DOCTYPE_NOT_ALLOWED: "XML_DOCTYPE_NOT_ALLOWED",
  XML_EXTERNAL_ENTITY_NOT_ALLOWED: "XML_EXTERNAL_ENTITY_NOT_ALLOWED",
  XML_MAX_DEPTH: "XML_MAX_DEPTH",
  XML_TOO_COMPLEX: "XML_TOO_COMPLEX",
  READ_TIMEOUT: "READ_TIMEOUT",
} as const;

/**
 * Crée une réponse d'erreur JSON standardisée.
 */
function errorResponse(
  code: string,
  message: string,
  requestId: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message, requestId } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Crée le middleware body multi-format.
 */
export function createBodyMiddleware(config: BodyMiddlewareConfig): Middleware {
  const c = { ...BODY_DEFAULTS, ...config };

  return async (req, ctx, next) => {
    const contentType = (req.headers.get("content-type") || "").toLowerCase().trim();
    const rawCl = req.headers.get("content-length");
    const transferEncoding = (req.headers.get("transfer-encoding") || "").toLowerCase().trim();

    // ── 1. Rejet chunked ─────────────────────────────────────────────────
    if (transferEncoding.includes("chunked")) {
      return errorResponse(
        ERROR_CODES.CHUNKED,
        "Chunked transfer encoding is not allowed",
        ctx.requestId,
        400,
      );
    }

    // ── 2. Déterminer le Content-Type et la limite ───────────────────────
    type ParseAction =
      | { type: "json"; limit: number }
      | { type: "form"; limit: number }
      | { type: "text"; limit: number }
      | { type: "xml"; limit: number }
      | { type: "multipart"; limit: number }
      | { type: "skip" };

    let action: ParseAction;

    if (contentType.includes("application/json")) {
      action = { type: "json", limit: c.jsonMaxBytes };
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      action = { type: "form", limit: c.formMaxBytes };
    } else if (contentType.includes("text/plain")) {
      action = { type: "text", limit: c.textMaxBytes };
    } else if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
      action = { type: "xml", limit: c.xmlMaxBytes };
    } else if (contentType.includes("multipart/form-data")) {
      action = { type: "multipart", limit: c.multipartMaxBytes };
    } else {
      // Pas de body connu
      return next();
    }

    // ── 3. Vérification Content-Length ET skip multipart AVANT lecture ──
    if (rawCl === null) {
      // Pas de Content-Length → skipping pour les non-JSON
      if (action.type !== "json" && action.type !== "form" && action.type !== "xml" && action.type !== "text" && action.type !== "multipart") {
        return next();
      }
      // Pour JSON/Form/XML/Text sans Content-Length, on lit quand même
      // mais on vérifie la taille après
    } else {
      const len = Number(rawCl);
      if (isNaN(len) || len < 0) {
        return errorResponse(
          ERROR_CODES.INVALID_CONTENT_LENGTH,
          "Invalid Content-Length",
          ctx.requestId,
          400,
        );
      }
      // Multipart : vérif taille mais PAS de lecture du body
      if (action.type === "multipart") {
        if (len > action.limit) {
          return errorResponse(
            ERROR_CODES.BODY_TOO_LARGE,
            `Request body too large (max ${action.limit} bytes)`,
            ctx.requestId,
            413,
          );
        }
        return next();
      }
      if (len > action.limit) {
        return errorResponse(
          ERROR_CODES.BODY_TOO_LARGE,
          `Request body too large (max ${action.limit} bytes)`,
          ctx.requestId,
          413,
        );
      }
    }

    // ── 4. Lecture du body (uniquement pour JSON, form, text, xml) ────────
    // Multipart a déjà été géré ci-dessus
    let rawText: string;
    try {
      rawText = await req.text();
    } catch (e) {
      if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "ReadTimeoutError") {
        return errorResponse(
          ERROR_CODES.READ_TIMEOUT,
          "Request body read timeout",
          ctx.requestId,
          408,
        );
      }
      return errorResponse(
        ERROR_CODES.INVALID_CONTENT_LENGTH,
        "Failed to read request body",
        ctx.requestId,
        400,
      );
    }

    // ── 5. Vérification taille après lecture (cas sans Content-Length) ───
    if (rawText.length > action.limit) {
      return errorResponse(
        ERROR_CODES.BODY_TOO_LARGE,
        `Request body too large (max ${action.limit} bytes)`,
        ctx.requestId,
        413,
      );
    }

    // ── 6. Parsing selon le type ─────────────────────────────────────────
    let bodyData: Record<string, unknown> | string;

    try {
      switch (action.type) {
        case "json": {
          const text = rawText.trim();
          if (!text) {
            bodyData = {};
          } else {
            bodyData = parseJsonSafe(text, {
              maxBytes: c.jsonMaxBytes,
              maxDepth: c.jsonMaxDepth,
            });
          }
          break;
        }

        case "form": {
          const text = rawText.trim();
          if (!text) {
            bodyData = {};
          } else {
            try {
              const flat = parseFormSafe(text, {
                maxBytes: c.formMaxBytes,
                maxKeys: c.formMaxKeys,
                keyMaxBytes: c.formKeyMaxBytes,
              });
              bodyData = formToNested(flat);
            } catch (e) {
              if (e && typeof e === "object" && "code" in e) {
                const code = (e as { code: string }).code;
                if (code === "FORM_TOO_LARGE") {
                  throw Object.assign(new Error("BODY_TOO_LARGE"), { code: "BODY_TOO_LARGE" });
                }
                throw e;
              }
              throw e;
            }
          }
          break;
        }

        case "text": {
          const text = rawText.trim();
          try {
            bodyData = parseTextSafe(text, { maxBytes: c.textMaxBytes });
          } catch (e) {
            if (e && typeof e === "object" && "code" in e) {
              const code = (e as { code: string }).code;
              if (code === "TEXT_TOO_LARGE") {
                throw Object.assign(new Error("BODY_TOO_LARGE"), { code: "BODY_TOO_LARGE" });
              }
              throw e;
            }
            throw e;
          }
          break;
        }

        case "xml": {
          const text = rawText.trim();
          if (!text) {
            bodyData = {};
          } else {
            bodyData = parseXmlSafe(text, {
              maxBytes: c.xmlMaxBytes,
              maxDepth: c.xmlMaxDepth,
              maxElements: c.xmlMaxElements,
            });
          }
          break;
        }

        case "multipart": {
          // Multipart a déjà été géré dans la section 3 (return next() après vérif taille)
          return next();
        }

        default:
          return next();
      }
    } catch (e) {
      if (e && typeof e === "object" && "code" in e) {
        const code = (e as { code: string }).code;
        const messages: Record<string, string> = {
          [ERROR_CODES.INVALID_JSON]: "Invalid JSON body",
          [ERROR_CODES.JSON_MAX_DEPTH]: "JSON too deeply nested",
          [ERROR_CODES.PROTOTYPE_POLLUTION]: "Invalid request body",
          [ERROR_CODES.INVALID_FORM]: "Invalid form encoding",
          [ERROR_CODES.FORM_TOO_LARGE]: "Form body too large",
          [ERROR_CODES.FORM_KEY_TOO_LONG]: "Form key too long",
          [ERROR_CODES.FORM_TOO_MANY_KEYS]: "Too many form fields",
          [ERROR_CODES.TEXT_TOO_LARGE]: "Text body too large",
          [ERROR_CODES.INVALID_XML]: "Invalid XML",
          [ERROR_CODES.XML_TOO_LARGE]: "XML body too large",
          [ERROR_CODES.XML_DOCTYPE_NOT_ALLOWED]: "DOCTYPE not allowed in XML",
          [ERROR_CODES.XML_EXTERNAL_ENTITY_NOT_ALLOWED]: "External entities not allowed in XML",
          [ERROR_CODES.XML_MAX_DEPTH]: "XML too deeply nested",
          [ERROR_CODES.XML_TOO_COMPLEX]: "XML too complex (too many elements)",
        };
        return errorResponse(
          code,
          messages[code] ?? "Invalid request body",
          ctx.requestId,
          code === ERROR_CODES.BODY_TOO_LARGE ? 413 : 400,
        );
      }
      throw e;
    }

    // ── 7. Attacher au contexte ──────────────────────────────────────────
    ctx.state.body = bodyData;

    return next();
  };
}
