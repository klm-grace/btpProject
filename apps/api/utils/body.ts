/**
 * Utilitaires de gestion du corps des requêtes pour apps/api.
 */

/**
 * Vérifie si le corps de la requête dépasse la limite autorisée.
 * Basé sur le header Content-Length pour rejeter rapidement.
 */
export function isBodyTooLarge(req: Request, maxBytes: number): boolean {
  const raw = req.headers.get("content-length");
  if (raw === null) return false;
  const len = Number(raw);
  if (!Number.isFinite(len) || len < 0) return true;
  return len > maxBytes;
}

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
