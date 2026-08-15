/**
 * Handlers pour les médias (upload, liste).
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { getAppContext } from "../utils/context";
import { randomUUID } from "node:crypto";

const STORAGE_PREFIX = "/api/media";

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
    return jsonErrorResponse(
      { message: `File too large (max ${app.config.storage.maxFileSizeBytes} bytes)`, code: "FILE_TOO_LARGE" },
      413,
    );
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
      return jsonErrorResponse({ message: "Nom de fichier trop long (max 255 caractères)", code: "FILENAME_TOO_LONG" }, 400);
    }
    const fileSize = fileField.size;
    if (fileSize === 0) {
      return jsonErrorResponse({ message: "Fichier vide", code: "EMPTY_FILE" }, 400);
    }

    // Lire le buffer
    const buffer = new Uint8Array(await fileField.arrayBuffer());
    if (buffer.byteLength > app.config.storage.maxFileSizeBytes) {
      return jsonErrorResponse(
        { message: `Fichier trop volumineux (max ${app.config.storage.maxFileSizeBytes} bytes)`, code: "FILE_TOO_LARGE" },
        413,
      );
    }

    // Déterminer le MIME type
    const detectedMime = fileField.type || "application/octet-stream";
    // Remplacer le type par défaut si c'est application/octet-stream
    const mime = detectedMime.startsWith("image/") ? detectedMime : "application/octet-stream";
    if (!mime.startsWith("image/")) {
      return jsonErrorResponse({ message: "Seules les images sont autorisées", code: "INVALID_MIME" }, 400);
    }

    // Vérifier que le MIME est autorisé
    if (!app.config.storage.allowedMimeTypes.includes(mime)) {
      return jsonErrorResponse(
        { message: `Type MIME "${mime}" non autorisé`, code: "INVALID_MIME" },
        400,
      );
    }

    // Créer le moteur d'upload
    const upload = app.upload;

    // Valider
    const validation = await upload.validate({ buffer, mime, originalName });
    if (!validation.ok) {
      return jsonErrorResponse(
        { message: validation.message, code: validation.code },
        400,
      );
    }

    // Uploader
    const result = await upload.upload({ buffer, mime, originalName, userId: user.id });

    // Insérer dans DB
    const mediaId = randomUUID();
    await app.db.sql.unsafe(
      `INSERT INTO media (id, original_name, mime_type, file_size, storage_key, type, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'image', $6, NOW())`,
      [mediaId, originalName, mime, result.size, result.key, user.id],
    );

    // Insérer les variantes
    if (result.variants) {
      const labels = ["thumbnail", "medium"] as const;
      for (let i = 0; i < result.variants.length; i++) {
        const v = result.variants[i]!;
        const label = labels[i] ?? `variant_${i}`;
        await app.db.sql.unsafe(
          `INSERT INTO media_variants (id, media_id, storage_key, width, label, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [randomUUID(), mediaId, v.key, app.config.storage.variantSizes[i] ?? 0, label],
        );
      }
    }

    app.log.info("Media uploaded", { mediaId, key: result.key, size: result.size, mime });

    return jsonOk({
      id: mediaId,
      key: result.key,
      mime,
      size: result.size,
      originalName,
      variants: result.variants,
    });
  } catch (e: unknown) {
    if (e instanceof Error && (e.message.includes("validation failed") || e.message.includes("validation"))) {
      return jsonErrorResponse(
        { message: e.message, code: "UPLOAD_VALIDATION_FAILED" },
        400,
      );
    }
    app.log.error("Media upload error", { message: (e as Error).message });
    return jsonErrorResponse({ message: "Upload failed", code: "UPLOAD_ERROR" }, 500);
  }
};
