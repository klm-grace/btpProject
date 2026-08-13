export interface MigrationFile {
  /** Nom du fichier (ex. 001_enable_extensions.sql). */
  name: string;
  /** Chemin complet du fichier. */
  path: string;
  /** Contenu SQL brut du fichier. */
  sql: string;
}

export interface MigrationStatus {
  /** Nom de la migration. */
  name: string;
  /** Date d'application (null si pas encore appliquée). */
  applied_at: string | null;
}

export interface MigrationResult {
  /** Nombre de migrations appliquées. */
  applied: number;
  /** Liste des noms appliqués. */
  names: string[];
}

export interface Migrations {
  /** Applique toutes les migrations non exécutées (up). */
  up(): Promise<MigrationResult>;
  /** Rétrograde les n dernières migrations (down). */
  down(n?: number): Promise<MigrationResult>;
  /** Retourne le statut de toutes les migrations. */
  status(): Promise<MigrationStatus[]>;
}
