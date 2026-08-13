/**
 * rbac — Bibliothèque de contrôle d'accès par rôles et permissions.
 *
 * Middlewares d'authentification (requireAuth) et d'autorisation
 * (requirePermission, requireResourcePermission) à composer sur les routes.
 * Cache des permissions par utilisateur (TTL configurable, injecté).
 *
 * Aucun process.env, aucun port, extraction possible.
 */

import { createRbac } from "./rbac.ts";

export type {
  Rbac, RbacDeps, RbacConfig, RbacUser,
  SessionReader, ResourceChecker, PermissionCheck,
} from "./types.ts";

export { createRbac } from "./rbac.ts";
