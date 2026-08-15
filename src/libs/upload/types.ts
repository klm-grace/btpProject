/**
 * upload — Types pour le pipeline d'upload.
 */

/** Mapping MIME → extension. */
export const EXT_FROM_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** Magic bytes par format. */
export const MAGIC_BYTES = {
  JPEG: [0xff, 0xd8, 0xff] as number[],
  PNG: [0x89, 0x50, 0x4e, 0x47] as number[],
  GIF: [0x47, 0x49, 0x46] as number[],
  WEBP: [0x52, 0x49, 0x46, 0x46] as number[], // "RIFF"
} as const;

/** Vérifie les magic bytes et retourne le MIME détecté. */
export function checkMagicBytes(buffer: Uint8Array): string | null {
  if (buffer.length < 3) return null;
  const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];

  if (b0 === MAGIC_BYTES.PNG[0] && b1 === MAGIC_BYTES.PNG[1] &&
      b2 === MAGIC_BYTES.PNG[2] && b3 === MAGIC_BYTES.PNG[3]) return "image/png";
  if (b0 === MAGIC_BYTES.JPEG[0] && b1 === MAGIC_BYTES.JPEG[1] &&
      b2 === MAGIC_BYTES.JPEG[2]) return "image/jpeg";
  if (b0 === MAGIC_BYTES.GIF[0] && b1 === MAGIC_BYTES.GIF[1] &&
      b2 === MAGIC_BYTES.GIF[2]) return "image/gif";
  if (b0 === MAGIC_BYTES.WEBP[0] && b1 === MAGIC_BYTES.WEBP[1] &&
      b2 === MAGIC_BYTES.WEBP[2] && b3 === MAGIC_BYTES.WEBP[3]) return "image/webp";
  return null;
}

/** Sanitize le key de stockage (defense path traversal). */
function sanitizeKey(key: string): string {
  if (key.includes("..") || key.includes("/") || key.includes("\\")) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  return key.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

/** Génère un key de stockage unique avec arborescence YYYY/MM/DD/. */
export function generateStorageKey(originalName: string, mime: string): string {
  const ext = EXT_FROM_MIME[mime] ?? ".bin";
  const uuid = crypto.randomUUID().replace(/-/g, "");
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const sanitized = sanitizeKey(originalName.replace(/\.[^.]+$/, ""));
  return `${year}/${month}/${day}/${uuid}_${sanitized}${ext}`;
}

/** Génère les clés de variantes. */
export function generateVariantKeys(baseKey: string, sizes: number[]): Array<{ key: string; size: number }> {
  return sizes.map((size) => ({
    key: `${baseKey.replace(/\.[^.]+$/, "")}_variant_${size}.webp`,
    size,
  }));
}

/** Fichier à uploader. */
export interface UploadFile {
  originalName: string;
  mime: string;
  buffer: Uint8Array;
  size: number;
}

/** Options de génération de variantes. */
export interface VariantOptions {
  thumbnailWidth: number;
  mediumWidth: number;
}