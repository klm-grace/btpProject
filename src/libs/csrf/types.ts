import type { Middleware } from "../router/types.ts";

/** Config injectée par l'app. */
export interface CsrfConfig {
  /** Nom du cookie CSRF (défaut : "csrf_token"). */
  cookieName?: string;
  /** Nom du header CSRF (défaut : "X-CSRF-Token"). */
  headerName?: string;
  /**
   * Méthodes HTTP protégées par le CSRF (défaut : POST, PUT, PATCH, DELETE).
   * GET, HEAD, OPTIONS ne sont jamais protégés (stateless).
   */
  protectedMethods?: string[];
  /**
   * Préfixes de paths exemptés du CSRF.
   * Tout chemin commençant par l'un de ces préfixes est ignoré.
   * Défaut : ['/api/auth/login', '/api/auth/logout', '/api/auth/csrf'].
   */
  exemptedPrefixes?: string[];
}

/** API publique retournée par createCsrf. */
export interface Csrf {
  /** Génère un token CSRF (64 hex chars, cryptographiquement sûr). */
  generate: () => string;
  /**
   * Vérifie que le token du header correspond au cookie.
   * Comparaison en temps constant.
   */
  verify: (cookieValue: string, headerValue: string) => boolean;
  /** Middleware CSRF pour le routeur (vérifie sur les mutations, exempte les paths). */
  middleware: Middleware;
}
