/**
 * r2 — Stockage via Cloudflare R2 (S3 compatible).
 *
 * Utilise Bun.S3Client natif. Endpoint R2 configuré via injection.
 * Pas de lecture de process.env.
 */

import type { StorageProvider } from "./types.ts";

interface R2ClientLike {
  write(key: string, body: Uint8Array | Blob | string): Promise<void>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; size: number } | null>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<Array<{ key: string; size: number }>>;
}

/**
 * Crée un fournisseur de stockage R2.
 */
export function createR2Storage(config: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): StorageProvider {
  // Créer le client S3/R2
  const s3 = new Bun.S3Client({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    endpoint: config.endpoint,
    bucket: config.bucket,
  }) as unknown as R2ClientLike;

  async function put(key: string, data: Uint8Array): Promise<void> {
    await s3.write(key, data);
  }

  async function get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await s3.get(key);
      return result ? result.body : null;
    } catch {
      return null;
    }
  }

  async function del(key: string): Promise<void> {
    try {
      await s3.delete(key);
    } catch {
      // Ignore si n'existe pas
    }
  }

  async function exists(key: string): Promise<boolean> {
    try {
      return await s3.exists(key);
    } catch {
      return false;
    }
  }

  async function size(): Promise<number> {
    // R2 ne expose pas de métrique de taille directement
    // Retourner 0 pour ne pas bloquer la logique de seuil
    return 0;
  }

  async function migrateToR2(_r2Provider: StorageProvider): Promise<number> {
    // La migration est gérée par le provider composite
    return 0;
  }

  function switchBackend(_backend: "disk" | "r2"): void {
    // Géré par le provider composite
  }

  return { put, get, del, exists, size, migrateToR2, switchBackend };
}
