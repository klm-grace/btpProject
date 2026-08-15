/**
 * storage — Bibliothèque de stockage hybride (Disque local ↔ Cloudflare R2).
 *
 * Abstraction unifiée : l'app n'a pas à connaître le backend.
 * Migration automatique disk → R2 quand le seuil est atteint.
 *
 * Aucun process.env, aucune port, extraction possible.
 */

import { createStorage } from "./storage.ts";

export type { 
  StorageProvider, 
  StorageConfig, 
  StorageDeps, 
  UploadResult, 
  UploadFile, 
  VariantOptions 
} from "./types.ts";

export { createStorage } from "./storage.ts";