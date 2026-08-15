import type {
  Rbac, RbacDeps, RbacConfig, RbacUser, PermissionCheck, ResourceChecker,
} from "./types.ts";
import type { Middleware, RouteContext } from "../router/types.ts";

function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Moteur RBAC — rôles, permissions et middlewares d'autorisation.
 *
 * Cache des permissions par utilisateur (TTL configurable) :
 * chargement depuis la DB au premier accès, puis en mémoire.
 */
export function createRbac(deps: RbacDeps, config: RbacConfig): Rbac {
  const { sessionReader, db } = deps;
  const cookieName = config.cookieName ?? "sid";

  // Cache permissions : userId → { permissions, expiresAt }
  const cache = new Map<string, { permissions: string[]; expiresAt: number }>();

  async function loadUserPermissions(userId: string): Promise<string[]> {
    const rows = await db.sql.unsafe<{ name: string }>(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1::uuid
       ORDER BY p.name`,
      [userId],
    );
    return rows.map((r) => r.name);
  }

  async function getUserPermissions(userId: string): Promise<string[]> {
    const now = Date.now();
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.permissions;
    }
    const permissions = await loadUserPermissions(userId);
    cache.set(userId, {
      permissions,
      expiresAt: now + config.cacheTtlMs,
    });
    return permissions;
  }

  function invalidate(userId: string): void {
    cache.delete(userId);
  }

  async function checkPermission(user: RbacUser, permission: string): Promise<PermissionCheck> {
    if (!user || !user.id) {
      return { allowed: false, code: "unauthorized", message: "Not authenticated" };
    }
    const permissions = await getUserPermissions(user.id);
    if (permissions.includes(permission)) {
      return { allowed: true };
    }
    return { allowed: false, code: "forbidden", message: "Forbidden" };
  }

  // ── Middleware requireAuth ──────────────────────────────────────────────

  const requireAuth: Middleware = async (req, ctx, next) => {
    const cookieHeader = req.headers.get("cookie");
    const sid = parseCookie(cookieHeader, cookieName);

    // Pas de cookie → 401 immédiat (pas d'appel DB/Redis inutile)
    if (!sid) {
      return jsonError(401, "unauthorized", "Not authenticated");
    }

    const user = await sessionReader(req);
    if (!user) {
      return jsonError(401, "unauthorized", "Invalid or expired session");
    }

    ctx.state.user = user;
    return next();
  };

  // ── Middleware requirePermission ────────────────────────────────────────

  function requirePermission(permission: string): Middleware {
    return async (req, ctx, next) => {
      const user = ctx.state.user as RbacUser | undefined;
      if (!user) {
        return jsonError(401, "unauthorized", "Not authenticated");
      }
      const check = await checkPermission(user, permission);
      if (!check.allowed) {
        return jsonError(check.code === "unauthorized" ? 401 : 403, check.code, check.message);
      }
      return next();
    };
  }

  // ── Middleware requireResourcePermission ────────────────────────────────

  function requireResourcePermission(
    permission: string,
    checkResource?: ResourceChecker,
  ): Middleware {
    return async (req, ctx, next) => {
      const user = ctx.state.user as RbacUser | undefined;
      if (!user) {
        return jsonError(401, "unauthorized", "Not authenticated");
      }

      const check = await checkPermission(user, permission);
      if (!check.allowed) {
        return jsonError(403, check.code, check.message);
      }

      // Vérification additionnelle par ressource (ex. propriété)
      if (checkResource) {
        const resourceId = ctx.params.id;
        if (!resourceId) {
          return jsonError(400, "bad_request", "Missing resource id");
        }
        const allowed = await checkResource(user, resourceId);
        if (!allowed) {
          return jsonError(403, "forbidden", "Forbidden");
        }
      }

      return next();
    };
  }

  return {
    requireAuth,
    requirePermission,
    requireResourcePermission,
    checkPermission,
    getUserPermissions,
    invalidate,
  };
}
