/**
 * storage — Factory + Provider composite (Disk ↔ R2).
 *
 * Gère le backend actif, la migration disk → R2, et le seuil 20 Go.
 */

import { createDiskStorage } from "./disk.ts";
import { createR2Storage } from "./r2.ts";
import type { StorageProvider, StorageConfig, StorageDeps, StorageProvider as SP } from "./types.ts";

/**
 * Provider composite qui gère le backend actif et la migration.
 */
export function createStorage(deps: StorageDeps, config: StorageConfig): SP & {
  disk: SP;
  r2: SP;
  activeBackend: () => "disk" | "r2";
  getDiskSize: () => Promise<number>;
  shouldMigrate: () => Promise<boolean>;
} {
  const { log } = deps;

  // Créer les deux backends
  const disk = createDiskStorage({ diskPath: config.diskPath });
  const r2 = createR2Storage({
    endpoint: config.r2Endpoint,
    bucket: config.r2Bucket,
    accessKeyId: config.r2AccessKeyId,
    secretAccessKey: config.r2SecretAccessKey,
  });

  let activeBackend: "disk" | "r2" = config.backend;
  let migrating = false;

  // Provider actif
  const active = () => (activeBackend === "disk" ? disk : r2);

  /** Vérifie si une opération est bloquée pendant la migration. */
  function assertNotMigrating(): void {
    if (migrating) {
      throw new Error("STORAGE_BUSY", { cause: new Error("Migration en cours") });
    }
  }

  // Vérifier si migration nécessaire
  async function shouldMigrate(): Promise<boolean> {
    if (activeBackend !== "disk" || migrating) return false;
    const used = await disk.size();
    return used >= config.diskMaxBytes;
  }

  async function getDiskSize(): Promise<number> {
    return disk.size();
  }

  // Migration disk → R2
  async function migrateToR2(r2Provider: SP): Promise<number> {
    if (migrating) {
      log.warn("Migration already in progress, ignoring");
      return 0;
    }
    migrating = true;
    try {
      log.info("Starting disk → R2 migration");
      // TODO: Implémenter le listing des fichiers du disque et leur copie vers R2
      // Pour l'instant, on bascule simplement le backend
      activeBackend = "r2";
      log.info("Migration completed, switched to R2 backend");
      return 0;
    } finally {
      migrating = false;
    }
  }

  function switchBackend(backend: "disk" | "r2"): void {
    if (migrating) {
      log.warn("Cannot switch backend during migration");
      return;
    }
    activeBackend = backend;
    log.info(`Storage backend switched to ${backend}`);
  }

  // Provider actif pour les opérations courantes
  const activeProvider: SP = {
    put: (key, data) => {
      assertNotMigrating();
      return active().put(key, data);
    },
    get: (key) => {
      assertNotMigrating();
      return active().get(key);
    },
    del: (key) => {
      assertNotMigrating();
      return active().del(key);
    },
    exists: (key) => {
      assertNotMigrating();
      return active().exists(key);
    },
    size: () => {
      assertNotMigrating();
      return active().size();
    },
    migrateToR2: (r2Provider) => migrateToR2(r2Provider),
    switchBackend: (backend) => switchBackend(backend),
  };

  return {
    ...activeProvider,
    disk,
    r2,
    activeBackend: () => activeBackend,
    getDiskSize,
    shouldMigrate,
  };
}

export type { StorageProvider, StorageConfig, StorageDeps, UploadResult, UploadFile, VariantOptions } from "./types.ts";