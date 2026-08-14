/**
 * Utilitaires de gestion des cookies pour apps/api.
 */

/**
 * Extrait une valeur de cookie par son nom depuis le header Cookie.
 */
export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
