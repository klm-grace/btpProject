/**
 * body — Types publics de la bibliothèque de parsing de corps de requête.
 *
 * Configuration unique et cohérente pour tous les parsers.
 */

/**
 * Configuration complète du middleware body.
 *
 * Toutes les valeurs ont des défauts raisonnables pour un API BTP.
 */
export interface BodyMiddlewareConfig {
  /** Taille max pour application/json en bytes (défaut: 4 Ko). */
  jsonMaxBytes: number;
  /** Profondeur max de syntaxe JSON (défaut: 32). */
  jsonMaxDepth: number;

  /** Taille max pour application/x-www-form-urlencoded en bytes (défaut: 4 Ko). */
  formMaxBytes: number;
  /** Nombre max de clés dans un formulaire (défaut: 100). */
  formMaxKeys: number;
  /** Longueur max d'une clé de formulaire en bytes (défaut: 100). */
  formKeyMaxBytes: number;

  /** Taille max pour text/plain en bytes (défaut: 1 Ko). */
  textMaxBytes: number;

  /** Taille max pour application/xml en bytes (défaut: 100 Ko). */
  xmlMaxBytes: number;
  /** Profondeur max de balises XML (défaut: 16). */
  xmlMaxDepth: number;
  /** Nombre max d'éléments XML (défaut: 1000, anti billion laughs). */
  xmlMaxElements: number;

  /** Taille max pour multipart/form-data en bytes (défaut: 10 Mo). */
  multipartMaxBytes: number;

  /** Timeout max pour la lecture streaming en ms (défaut: 5000). */
  readTimeoutMs: number;
}

/** Valeurs par défaut de la configuration. */
export const BODY_DEFAULTS: BodyMiddlewareConfig = {
  jsonMaxBytes: 4_096,
  jsonMaxDepth: 32,
  formMaxBytes: 4_096,
  formMaxKeys: 100,
  formKeyMaxBytes: 100,
  textMaxBytes: 1_024,
  xmlMaxBytes: 100 * 1024, // 100 Ko
  xmlMaxDepth: 16,
  xmlMaxElements: 1_000,
  multipartMaxBytes: 10 * 1024 * 1024, // 10 Mo
  readTimeoutMs: 5_000,
};

/** Clés interdites dans tous les parsers (prototype pollution defense). */
export const PROHIBITED_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** Types de Content-Type supportés par le middleware. */
export type BodyContentType =
  | "application/json"
  | "application/x-www-form-urlencoded"
  | "text/plain"
  | "application/xml"
  | "text/xml"
  | "multipart/form-data";

/** Corps analysé et attaché à ctx.state.body. */
export interface BodyResult {
  /** Corps parsé en objet (JSON, form, XML) ou texte brut. */
  data: Record<string, unknown> | string;
  /** Content-Type détecté. */
  contentType: BodyContentType;
}
