/**
 * disk — Stockage sur disque local.
 *
 * Écriture/lecture via fs/promises. Les fichiers sont stockés dans
 * un dossier configuré (STORAGE_DISK_PATH). Pas de lecture de process.env.
 */

import { existsSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { StorageProvider } from "./types.ts";

/** Extrair le nom de fichier d'une clé et vérifier l'absence de path traversal. */
function sanitizeKey(key: string): string {
  // Extraire le nom de fichier final (après le dernier / ou \)
  const filename = key.replace(/^.*[/\\]/, "").replace(/[\\]/g, "");
  if (!filename) {
    throw new Error("Invalid storage key: empty filename");
  }
  // Rejeter si le nom contient des séquences de traversal
  if (filename.includes("..") || filename.includes("/")) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  // Limiter la longueur du nom de fichier (max 255 caractères)
  if (filename.length > 255) {
    throw new Error("Invalid storage key: filename too long");
  }
  return filename;
}

/**
 * Crée un fournisseur de stockage sur disque.
 */
export function createDiskStorage(config: { diskPath: string }): StorageProvider {
  // Créer le dossier s'il n'existe pas
  const basePath = resolve(config.diskPath);
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }

  async function put(key: string, data: Uint8Array): Promise<void> {
    const sanitized = sanitizeKey(key);
    const filePath = join(basePath, sanitized);
    // Vérifier que le chemin reste dans basePath (sécurité)
    if (!filePath.startsWith(basePath + "/") && filePath !== basePath) {
      throw new Error("Invalid storage key: path traversal detected");
    }
    writeFileSync(filePath, data);
  }

  async function get(key: string): Promise<Uint8Array | null> {
    const sanitized = sanitizeKey(key);
    const filePath = join(basePath, sanitized);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }

  async function del(key: string): Promise<void> {
    const sanitized = sanitizeKey(key);
    const filePath = join(basePath, sanitized);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }

  async function exists(key: string): Promise<boolean> {
    const sanitized = sanitizeKey(key);
    const filePath = join(basePath, sanitized);
    return existsSync(filePath);
  }

  async function size(): Promise<number> {
    let total = 0;
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
          try {
            total += statSync(join(dir, entry.name)).size;
          } catch { /* ignore */ }
        }
      }
    }
    walk(basePath);
    return total;
  }

  async function migrateToR2(_r2Provider: StorageProvider): Promise<number> {
    // Implémenté dans storage.ts avec le contexte R2
    return 0;
  }

  function switchBackend(_backend: "disk" | "r2"): void {
    // Géré par le provider composite
  }

  return { put, get, del, exists, size, migrateToR2, switchBackend };
}
