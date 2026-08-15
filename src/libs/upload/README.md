/**
 * upload — Bibliothèque de pipeline upload (validation + variantes + storage).
 *
 * ## Rôle
 *
 * Valider et traiter les uploads de médias (images) :
 * 1. Validation en 4 couches contre le spoofing
 * 2. Génération de variantes WebP (thumbnail, medium)
 * 3. Upload via le StorageProvider injecté
 *
 * ## Architecture
 *
 * ```
 * Requête multipart
 *   → validate() (4 couches)
 *   → generateStorageKey() (UUID + YYYY/MM/DD/)
 *   → storage.put() (original)
 *   → generateVariants() (WebP resize)
 *   → storage.put() (variantes)
 *   → retourne UploadResult
 * ```
 *
 * ## Sécurité
 *
 * - **Couche 1** : Content-Length ≤ maxFileSizeBytes (coupe avant parsing)
 * - **Couche 2** : Magic bytes (rejette les évidents)
 * - **Couche 3** : Extension correspond au MIME
 * - **Couche 4** : Décodeur Bun.Image (rejet si échec)
 * - **Path traversal** : clés sanitizées (UUID uniquement)
 */

import { createUpload } from "./upload.ts";

export { createUpload } from "./upload.ts";
export type {
  UploadConfig,
  UploadResult,
  UploadValidationError,
  UploadValidationResult,
} from "./upload.ts";
export type { UploadFile, VariantOptions, UploadResult as UploadResultType } from "./types.ts";
export { checkMagicBytes, generateStorageKey, generateVariantKeys, MAGIC_BYTES } from "./types.ts";