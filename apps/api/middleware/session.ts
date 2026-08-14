/**
 * Middleware de session — lit le cookie de session et charge l'utilisateur.
 */

import type { Middleware } from "../types";
import { COOKIE_NAMES } from "../constants";
import { parseCookie } from "../utils/cookies";
import { getAppContext } from "../utils/context";

/**
 * Middleware qui lit le cookie de session et charge l'utilisateur authentifié.
 * Stocke `ctx.state.user` (RbacUser) ou `null`.
 * Les handlers accèdent à l'utilisateur via `ctx.state.user`.
 */
export const sessionMiddleware: Middleware = async (req, ctx, next) => {
  const app = getAppContext(ctx);
  const cookieHeader = req.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

  ctx.state.user = null;

  if (sessionId) {
    try {
      const user = await app.auth.getSession(sessionId);
      if (user) {
        ctx.state.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
          mfaEnabled: user.mfaEnabled,
        };
      }
    } catch (e: unknown) {
      app.log.error("Session middleware error", { error: e });
      ctx.state.user = null;
    }
  }

  return next();
};