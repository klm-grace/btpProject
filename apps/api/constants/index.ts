/**
 * Constantes applicatives pour apps/api.
 */

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo — taille max d'un fichier uploadé
export const REQUEST_TIMEOUT_MS = 10_000;

export const COOKIE_NAMES = {
  session: "sid",
  csrf: "csrf_token",
} as const;

export const CSRF_EXEMPTED_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/csrf",
] as const;

export const COOKIE_SETTINGS = {
  session: {
    httponly: true,
    secure: true,
    sameSite: "Strict" as const,
  },
  csrf: {
    httponly: false, // Le front doit pouvoir lire le token CSRF
    secure: true,
    sameSite: "Strict" as const,
  },
} as const;
