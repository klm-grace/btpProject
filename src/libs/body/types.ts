/**
 * body — Parser et validateur de corps de requête.
 *
 * Incapsule la vérification de taille selon le Content-Type.
 * Pas de process.env, injection de config, extraction possible.
 *
 * Usage :
 *   const parser = createBodyParser({ log }, { jsonMaxBytes: 4096, multipartMaxBytes: 10_485_760 });
 *   const tooLarge = parser.check(req);
 *   if (tooLarge) return tooLarge;
 */

/** Configuration du parser. */
export interface BodyConfig {
  /** Taille max pour application/json (défaut: 4 Ko). */
  jsonMaxBytes: number;
  /** Taille max pour multipart/form-data (défaut: 10 Mo). */
  multipartMaxBytes: number;
}

/** Dépendances injectées. */
export interface BodyDeps {
  log: { info(message: string, fields?: Record<string, unknown>): void };
}

/** Parser de corps de requête. */
export interface BodyParser {
  /** Vérifie si le body dépasse la limite selon Content-Type. Retourne une Response 413 ou null. */
  check(req: Request): Response | null;
  /** Parse le body JSON avec vérification de taille. */
  parseJson(req: Request): Promise<Record<string, unknown>>;
}
