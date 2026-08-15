/**
 * Utilitaires de gestion du corps des requêtes pour apps/api.
 */

/**
 * Parse le corps JSON d'une requête de manière sécurisée.
 * Retourne un objet vide si le corps est absent.
 * Lève une erreur si le JSON est malformé.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json_body");
  }
}
