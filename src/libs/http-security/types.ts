// ── Types publics ────────────────────────────────────────────────────────────

/** Configuration des headers de sécurité HTTP. */
export interface SecurityHeadersConfig {
  /** Content-Security-Policy (par défaut : `default-src 'none'`). */
  csp?: string;
  /** Strict-Transport-Security max-age en secondes (par défaut : 31536000 = 1 an). */
  hstsMaxAge?: number;
  /** X-Frame-Options (par défaut : DENY). */
  frameOptions?: string;
  /** Referrer-Policy (par défaut : strict-origin-when-cross-origin). */
  referrerPolicy?: string;
  /** Permissions-Policy (par défaut : none). */
  permissionsPolicy?: string;
  /** X-Content-Type-Options (par défaut : nosniff). */
  contentTypeOptions?: string;
  /** Cross-Origin-Opener-Policy (par défaut : same-origin). */
  crossOriginOpenerPolicy?: string;
  /** Cross-Origin-Resource-Policy (par défaut : same-origin). */
  crossOriginResourcePolicy?: string;
}

/** Configuration CORS avec liste blanche stricte. */
export interface CorsConfig {
  /** Origines autorisées (pas de wildcard en prod). Jamais "*" si credentials=true. */
  origins: string[];
  /** Méthodes autorisées (par défaut : GET,POST,PUT,PATCH,DELETE,OPTIONS). */
  methods?: string[];
  /** Headers autorisés côté client (par défaut : Content-Type, Authorization, X-Request-Id). */
  allowedHeaders?: string[];
  /** Headers exposés côté client (par défaut : x-request-id). */
  exposedHeaders?: string[];
  /** Active credentials: true (cookies, Authorization). Par défaut : false. */
  credentials?: boolean;
  /** Durée de cache du preflight en secondes (par défaut : 86400). */
  maxAge?: number;
}

/** Configuration du trusted proxy. */
export interface TrustedProxyConfig {
  /** true si derrière un reverse proxy (nginx, Caddy, Cloudflare). */
  trustProxy: boolean;
}

/** Résultat du CORS après résolution d'origine. */
export interface CorsResult {
  /** true si l'origine est dans la liste blanche. */
  allowed: boolean;
  /** Headers CORS à appliquer (null si non autorisé). */
  headers: Record<string, string> | null;
}
