/**
 * storage — Abstraction de stockage (Disque local ou Cloudflare R2).
 *
 * Interface unifiée pour que l'app n'ait pas à connaître le backend.
 * Pas de process.env, injection de config, extraction possible.
 */

/** Configuration du stockage injectée par l'app. */
export interface StorageConfig {
  /** Backend à utiliser : "disk" ou "r2". */
  backend: "disk" | "r2";
  /** Chemin absolu du dossier de stockage local. */
  diskPath: string;
  /** Seuil max en bytes avant migration disque → R2 (défaut: 20 Go). */
  diskMaxBytes: number;
  /** Cloudflare R2 — ID de compte. */
  r2AccountId: string;
  /** Cloudflare R2 — Endpoint (ex: https://<id>.r2.cloudflarestorage.com). */
  r2Endpoint: string;
  /** Cloudflare R2 — Nom du bucket. */
  r2Bucket: string;
  /** Cloudflare R2 — Access Key ID. */
  r2AccessKeyId: string;
  /** Cloudflare R2 — Secret Access Key. */
  r2SecretAccessKey: string;
}

/** Dépendances injectées par l'app. */
export interface StorageDeps {
  /** Logger structuré. */
  log: {
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
  };
}

/** Interface commune du fournisseur de stockage. */
export interface StorageProvider {
  /** Stocke un fichier. */
  put(key: string, data: Uint8Array): Promise<void>;
  /** Récupère un fichier. */
  get(key: string): Promise<Uint8Array | null>;
  /** Supprime un fichier. */
  del(key: string): Promise<void>;
  /** Vérifie l'existence. */
  exists(key: string): Promise<boolean>;
  /** Taille totale utilisée en bytes (0 pour R2 non mesurable sans list). */
  size(): Promise<number>;
  /** Migre tous les fichiers du disque vers R2. */
  migrateToR2(r2Provider: StorageProvider): Promise<number>;
  /** Change le backend actif. */
  switchBackend(backend: "disk" | "r2"): void;
}

/** Résultat d'un upload. */
export interface UploadResult {
  key: string;
  size: number;
  mime: string;
}

/** Fichier à uploader. */
export interface UploadFile {
  /** Nom original fourni par l'utilisateur. */
  originalName: string;
  /** Type MIME détecté. */
  mime: string;
  /** Contenu binaire. */
  buffer: Uint8Array;
  /** Taille en bytes. */
  size: number;
}

/** Options de génération de variantes. */
export interface VariantOptions {
  /** Largeur max pour la variante thumbnail. */
  thumbnailWidth: number;
  /** Largeur max pour la variante medium. */
  mediumWidth: number;
}