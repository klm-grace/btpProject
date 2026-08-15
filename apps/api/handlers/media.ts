/**
 * Handlers pour les médias (upload, liste, suppression).
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { logLoginAttempt, logForbiddenAccess, logIntrusionAttempt } from "../utils/logger-helpers";
import { getAppContext } from "../utils/context";
import { randomUUID } from "node:crypto";

const STORAGE_PREFIX = "/api/media";

/** Messages d'erreur génériques — jamais de code interne exposé. */
const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  EMPTY_FILE: "Fichier vide",
  FILE_TOO_LARGE: "Fichier trop volumineux",
  INVALID_MAGIC: "Format de fichier non supporté",
  EXTENSION_MISMATCH: "Extension du fichier incompatible avec son contenu",
  INVALID_IMAGE: "Image invalide ou corrompue",
  STORAGE_FULL: "Stockage plein, veuillez réessayer plus tard",
};

function mapUploadError(code: string): string {
  return UPLOAD_ERROR_MESSAGES[code] ?? "Erreur lors du traitement du fichier";
}

/**
 * POST /api/media — Upload un fichier.
 */
export const handleMediaUpload: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);

  // Vérification session
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  // Vérification Content-Length (couche anti-spoofing)
  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) > app.config.storage.maxFileSizeBytes) {
    return jsonErrorResponse({ message: "Fichier trop volumineux", code: "FILE_TOO_LARGE" }, 413);
  }

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const fileFieldRaw = formData.get("file");
    const fileField = (fileFieldRaw instanceof File ? fileFieldRaw : null) ||
                      (fileFieldRaw instanceof Blob && "name" in fileFieldRaw ? fileFieldRaw as unknown as File : null);
    if (!fileField) {
      return jsonErrorResponse({ message: "Aucun fichier fourni", code: "MISSING_FILE" }, 400);
    }

    const originalName = (fileField as File).name || "upload";
    // Limiter la longueur du nom de fichier (max 255 caractères)
    if (originalName.length > 255) {
      return jsonErrorResponse({ message: "Nom de fichier trop long", code: "FILENAME_TOO_LONG" }, 400);
    }
    const fileSize = fileField.size;
    if (fileSize === 0) {
      return jsonErrorResponse({ message: "Fichier vide", code: "EMPTY_FILE" }, 400);
    }

    // Lire le buffer
    const buffer = new Uint8Array(await fileField.arrayBuffer());
    if (buffer.byteLength > app.config.storage.maxFileSizeBytes) {
      return jsonErrorResponse({ message: "Fichier trop volumineux", code: "FILE_TOO_LARGE" }, 413);
    }

    // Déterminer le MIME type
    const detectedMime = fileField.type || "application/octet-stream";
    const mime = detectedMime.startsWith("image/") ? detectedMime : "application/octet-stream";
    if (!mime.startsWith("image/")) {
      return jsonErrorResponse({ message: "Seules les images sont autorisées", code: "INVALID_MIME" }, 400);
    }

    // Vérifier que le MIME est autorisé
    if (!app.config.storage.allowedMimeTypes.includes(mime)) {
      return jsonErrorResponse({ message: "Type de fichier non autorisé", code: "INVALID_MIME" }, 400);
    }

    // Vérifier la capacité du storage (anti-DoS)
    if (app.config.storage.maxStorageBytes > 0) {
      const currentSize = await app.storage.size();
      if (currentSize + buffer.byteLength > app.config.storage.maxStorageBytes) {
        return jsonErrorResponse({ message: "Stockage plein", code: "STORAGE_FULL" }, 507);
      }
    }

    // Créer le moteur d'upload
    const upload = app.upload;

    // Valider
    const validation = await upload.validate({ buffer, mime, originalName });
    if (!validation.ok) {
      // Ne JAMAIS exposer le code interne — message générique
      return jsonErrorResponse(
        { message: mapUploadError(validation.code), code: "UPLOAD_VALIDATION_FAILED" },
        400,
      );
    }

    // Uploader
    const uploadResult = await upload.upload({ buffer, mime, originalName, userId: user.id });

    // Vérifier si upload a retourné une erreur (validation + capacity)
    if (uploadResult && typeof uploadResult === "object" && "ok" in uploadResult && !uploadResult.ok) {
      return jsonErrorResponse(
        { message: mapUploadError(uploadResult.code), code: "UPLOAD_VALIDATION_FAILED" },
        400,
      );
    }

    // Insérer dans DB
    const mediaId = randomUUID();
    await app.db.sql.unsafe(
      `INSERT INTO media (id, original_name, mime_type, file_size, storage_key, type, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'image', $6, NOW())`,
      [mediaId, originalName, mime, (uploadResult as any).size, (uploadResult as any).key, user.id],
    );

    // Insérer les variantes
    const storageKeys: string[] = [(uploadResult as any).key];
    if ((uploadResult as any).variants) {
      const labels = ["thumbnail", "medium"] as const;
      for (let i = 0; i < (uploadResult as any).variants.length; i++) {
        const v = (uploadResult as any).variants[i]!;
        const label = labels[i] ?? `variant_${i}`;
        storageKeys.push(v.key);
        await app.db.sql.unsafe(
          `INSERT INTO media_variants (id, media_id, storage_key, width, label, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [randomUUID(), mediaId, v.key, app.config.storage.variantSizes[i] ?? 0, label],
        );
      }
    }

    app.log.info("Media uploaded", { mediaId, key: (uploadResult as any).key, size: (uploadResult as any).size, mime });

    return jsonOk({
      id: mediaId,
      key: (uploadResult as any).key,
      mime,
      size: (uploadResult as any).size,
      originalName,
      variants: (uploadResult as any).variants,
    });
  } catch (e: unknown) {
    // Ne JAMAIS exposer le message d'erreur technique
    if (e instanceof Error && e.message.includes("validation")) {
      return jsonErrorResponse({ message: "Erreur lors du traitement du fichier", code: "UPLOAD_VALIDATION_FAILED" }, 400);
    }
    app.log.error("Media upload error", { message: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "UPLOAD_ERROR" }, 500);
  }
};

/**
 * DELETE /api/media/:id — Supprime un média.
 * Vérification de propriété: seul l'auteur peut supprimer son média.
 */
export const handleMediaDelete: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);

  // Vérification session
  const user = ctx.state.user as import("../types").AuthUser | null;
  if (!user) {
    return jsonErrorResponse({ message: "Non authentifié", code: "UNAUTHORIZED" }, 401);
  }

  const mediaId = ctx.params.id;
  if (!mediaId) {
    return jsonErrorResponse({ message: "ID requis", code: "MISSING_ID" }, 400);
  }

  try {
    // Récupérer le média et vérifier la propriété
    const media = await app.db.sql`
      SELECT m.id, m.storage_key, m.mime_type, m.file_size, m.uploaded_by
      FROM media m
      WHERE m.id = ${mediaId}
      LIMIT 1
    `;

    if (media.length === 0) {
      return jsonErrorResponse({ message: "Média non trouvé", code: "NOT_FOUND" }, 404);
    }

    // 🔒 IDOR FIX: Vérifier que le média appartient à l'utilisateur connecté
    if (media[0]!.uploaded_by !== user.id) {
      app.log.warn("IDOR attempt blocked", { mediaId, userId: user.id, mediaOwnerId: media[0]!.uploaded_by });
      return jsonErrorResponse({ message: "Non autorisé", code: "FORBIDDEN" }, 403);
    }

    const variants = await app.db.sql`
      SELECT storage_key FROM media_variants WHERE media_id = ${mediaId}
    `;

    // Construire la liste des clés à supprimer
    const storageKeys = [media[0]!.storage_key as string];
    for (const v of variants) {
      storageKeys.push(v.storage_key as string);
    }

    // Supprimer du storage
    await app.upload.deleteByMediaId(mediaId, storageKeys);

    // Supprimer de la DB (variantes d'abord, puis média)
    await app.db.sql`DELETE FROM media_variants WHERE media_id = ${mediaId}`;
    await app.db.sql`DELETE FROM media WHERE id = ${mediaId}`;

    app.log.info("Media deleted", { mediaId, keysDeleted: storageKeys.length });

    return jsonOk({ id: mediaId, deleted: true });
  } catch (e: unknown) {
    app.log.error("Media delete error", { mediaId, message: (e as Error).message });
    return jsonErrorResponse({ message: "Erreur serveur", code: "DELETE_ERROR" }, 500);
  }
};
