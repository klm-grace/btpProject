/**
 * Middlewares pour apps/api.
 */

import type { Middleware, RouteContext } from "../types";
import { parseCookie } from "../utils/cookies";
import { COOKIE_NAMES } from "../constants";

/**
 * Middleware de session : lit le cookie de session et injecte l'utilisateur dans le contexte.
 * Ce middleware est utilisé par RBAC et Auth.
 */
export const sessionMiddleware: Middleware = async (req, ctx, next) => {
  const cookieHeader = req.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

  if (!sessionId) {
    ctx.state.user = null;
    return next();
  }

  try {
    // On utilise l'instance auth injectée dans le contexte
    const user = await ctx.app.auth.getSession(sessionId);
    ctx.state.user = user;
  } catch (e) {
    ctx.app.log.error("Session recovery failed", { error: e, sessionId });
    ctx.state.user = null;
  }

  return next();
};
