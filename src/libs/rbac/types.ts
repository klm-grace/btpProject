// ── Types publics ────────────────────────────────────────────────────────────

/** Utilisateur authentifié (fourni par le sessionReader). */
export interface RbacUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  mfaEnabled?: boolean;
}

/**
 * Lecteur de session injecté par l'app.
 * Découple RBAC de l'auth : l'app combine parsing cookie + auth.getSession.
 */
export type SessionReader = (req: Request) => Promise<RbacUser | null>;

/**
 * Vérification additionnelle par ressource (sections CRUD).
 * Ex. : un éditeur ne modifie que ses propres contenus.
 */
export type ResourceChecker = (
  user: RbacUser,
  resourceId: string,
) => Promise<boolean>;

/** Dépendances injectées par l'app. */
export interface RbacDeps {
  /** Lit la session depuis la requête (cookie → auth.getSession). */
  sessionReader: SessionReader;
  /** Client DB (tables permissions, role_permissions, user_roles). */
  db: {
    sql: {
      unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    };
  };
}

/** Config injectée par l'app. */
export interface RbacConfig {
  /** TTL du cache des permissions par utilisateur (ms). */
  cacheTtlMs: number;
  /** Nom du cookie de session (défaut : "sid"). */
  cookieName?: string;
}

/** Résultat de vérification d'une permission. */
export type PermissionCheck =
  | { allowed: true }
  | { allowed: false; code: "unauthorized" | "forbidden"; message: string };

// ── Interface du moteur RBAC retourné par createRbac ─────────────────────────

export interface Rbac {
  /**
   * Middleware d'authentification : lit la session, remplit ctx.state.user.
   * Court-circuite en 401 si non connecté.
   */
  requireAuth: import("../router/types.ts").Middleware;
  /**
   * Middleware d'autorisation : vérifie que l'utilisateur (ctx.state.user)
   * possède la permission demandée. Court-circuite en 403 si refusé.
   */
  requirePermission: (permission: string) => import("../router/types.ts").Middleware;
  /**
   * Middleware d'autorisation par ressource : permission + vérification
   * additionnelle (ex. propriété de la ressource). Court-circuite en 403.
   */
  requireResourcePermission: (
    permission: string,
    checkResource?: ResourceChecker,
  ) => import("../router/types.ts").Middleware;
  /** Vérifie une permission pour un utilisateur (sans middleware). */
  checkPermission: (user: RbacUser, permission: string) => Promise<PermissionCheck>;
  /** Retourne les permissions de l'utilisateur (cache + DB). */
  getUserPermissions: (userId: string) => Promise<string[]>;
  /** Invalide le cache d'un utilisateur. */
  invalidate: (userId: string) => void;
}
