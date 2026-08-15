/**
 * upload — Pipeline d'upload et validation de médias.
 */

import type { StorageProvider } from "@libs/storage";
import {
  checkMagicBytes,
  generateStorageKey,
  generateVariantKeys,
  EXT_FROM_MIME,
} from "./types.ts";

export type { UploadFile, VariantOptions } from "./types.ts";

/** Options de configuration. */
export interface UploadConfig {
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  imageMaxWidth: number;
  imageMaxHeight: number;
  variantSizes: number[];
  webpQuality: number;
}

/** Résultat d'un upload. */
export interface UploadResult {
  id: string;
  key: string;
  mime: string;
  size: number;
  originalName: string;
  variants?: Array<{ key: string; size: number }>;
}

/** Erreur de validation. */
export interface UploadValidationError {
  ok: false;
  code: string;
  message: string;
}

export type UploadValidationResult = { ok: true } | UploadValidationError;

/**
 * Type du moteur d'upload retourné par createUpload.
 */
export type UploadEngine = ReturnType<typeof createUpload>;

/**
 * Crée un moteur d'upload.
 */
export function createUpload(
  deps: { storage: StorageProvider; log: { info: (m: string, f?: Record<string, unknown>) => void } },
  config: UploadConfig,
) {
  const { storage, log } = deps;

  async function validate(file: { buffer: Uint8Array; mime: string; originalName: string }): Promise<UploadValidationResult> {
    if (file.buffer.byteLength > config.maxFileSizeBytes) {
      return { ok: false, code: "FILE_TOO_LARGE", message: `Fichier trop volumineux (max ${config.maxFileSizeBytes} bytes)` };
    }
    if (file.buffer.byteLength === 0) {
      return { ok: false, code: "EMPTY_FILE", message: "Fichier vide" };
    }

    const detectedMime = checkMagicBytes(file.buffer);
    if (!detectedMime) {
      return { ok: false, code: "INVALID_MAGIC", message: "Magic bytes non reconnus" };
    }

    const expectedExt = EXT_FROM_MIME[detectedMime];
    if (expectedExt && !file.originalName.toLowerCase().endsWith(expectedExt)) {
      return { ok: false, code: "EXTENSION_MISMATCH", message: "L'extension ne correspond pas au contenu" };
    }

    try {
      const img = new Bun.Image(file.buffer);
      const testImg = img.resize(
        Math.min(img.width > 0 ? img.width : 1, config.imageMaxWidth),
        Math.min(img.height > 0 ? img.height : 1, config.imageMaxHeight),
      );
      const testWebp = testImg.webp({ quality: config.webpQuality || 80 });
      await testWebp.buffer();
    } catch {
      return { ok: false, code: "INVALID_IMAGE", message: "Image invalide ou corrompue" };
    }

    return { ok: true };
  }

  async function generateVariants(
    buffer: Uint8Array,
    _mime: string,
    opts: { maxWidth?: number; maxHeight?: number } = {},
  ): Promise<Array<{ key: string; data: Uint8Array; size: number; width: number }>> {
    const variants: Array<{ key: string; data: Uint8Array; size: number; width: number }> = [];
    try {
      const img = new Bun.Image(buffer);
      const maxWidth = opts.maxWidth || config.imageMaxWidth;
      const maxHeight = opts.maxHeight || config.imageMaxHeight;

      for (const targetWidth of config.variantSizes) {
        const scale = Math.min(targetWidth / Math.max(img.width > 0 ? img.width : 1, 1), 1);
        const w = Math.max(1, Math.round(img.width > 0 ? img.width * scale : targetWidth));
        const h = Math.max(1, Math.round(img.height > 0 ? img.height * scale : Math.round(targetWidth * (maxHeight / maxWidth))));
        const resized = img.resize(w, h);
        const webpImg = resized.webp({ quality: config.webpQuality || 80 });
        const data = await webpImg.buffer();
        variants.push({ key: `${targetWidth}w`, data, size: data.byteLength, width: w });
      }
    } catch (e) {
      log.info("Variant generation failed", { error: (e as Error).message });
    }
    return variants;
  }

  async function upload(
    file: { buffer: Uint8Array; mime: string; originalName: string; userId?: string },
  ): Promise<UploadResult> {
    const validation = await validate(file);
    if (!validation.ok) {
      throw new Error(`Upload validation failed: ${validation.code} - ${validation.message}`);
    }

    const key = generateStorageKey(file.originalName, file.mime);
    const mime = file.mime || checkMagicBytes(file.buffer) || "application/octet-stream";

    await storage.put(key, file.buffer);
    log.info("File uploaded", { key, size: file.buffer.byteLength, mime });

    let variants: Array<{ key: string; size: number }> | undefined;
    if (mime.startsWith("image/")) {
      const variantKeys = generateVariantKeys(key, config.variantSizes);
      const variantResults = await generateVariants(file.buffer, mime, {
        maxWidth: config.imageMaxWidth,
        maxHeight: config.imageMaxHeight,
      });

      for (let i = 0; i < variantResults.length && i < variantKeys.length; i++) {
        const vr = variantResults[i]!;
        const vk = variantKeys[i]!;
        await storage.put(vk.key, vr.data);
        log.info("Variant uploaded", { key: vk.key, size: vr.size, width: vr.width });
      }

      variants = variantKeys.map((vk, i) => ({
        key: vk.key,
        size: variantResults[i]?.size ?? 0,
      }));
    }

    return {
      id: crypto.randomUUID(),
      key,
      mime,
      size: file.buffer.byteLength,
      originalName: file.originalName,
      variants,
    };
  }

  async function deleteByMediaId(_mediaId: string): Promise<void> {
    log.info("deleteByMediaId called", { mediaId: _mediaId });
  }

  async function cleanupOrphans(_maxAgeHours: number): Promise<number> {
    log.info("cleanupOrphans called", { maxAgeHours: _maxAgeHours });
    return 0;
  }

  return {
    validate,
    generateVariants,
    upload,
    deleteByMediaId,
    cleanupOrphans,
  };
}