/**
 * Utils de validation réutilisables dans les handlers.
 */

/**
 * Vérifie qu'une chaîne est un UUID v4 valide.
 * @returns true si valide, false sinon
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Retourne un error JSON si l'ID n'est pas un UUID valide.
 * Utile pour les handlers : retourne directement la réponse d'erreur.
 */
export function assertUUID(id: string | undefined): Response | null {
  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "MISSING_ID", message: "ID requis" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!isValidUUID(id)) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "INVALID_UUID", message: "Format d'identifiant invalide" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
