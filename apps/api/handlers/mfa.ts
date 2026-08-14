/**
 * Handlers pour le MFA (Multi-Factor Authentication) de apps/api.
 */

import type { RouteContext, RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { COOKIE_NAMES } from "../constants";
import { parseCookie } from "../utils/cookies";

/**
 * POST /api/auth/mfa/verify
 */
export const handleMfaVerify: RouteHandler = async (req, ctx) => {
  try {
    const body = await import("../utils/body").then(m => m.readJsonBody(req));
    const { token, code } = body;

    if (!token || !code) {
      return jsonErrorResponse({ message: "Token and code are required", code: "MISSING_PARAMS" }, 400);
    }

    const result = await ctx.app.auth.verifyMfa(token, code);

    if (!result.success) {
      return jsonErrorResponse({ message: result.error, code: "MFA_FAILED" }, 401);
    }

    const res = jsonOk({ success: true, user: result.user });
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.session}=${result.sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${ctx.app.config.sessionExpiryHours * 3600}`);
    
    const csrfToken = await ctx.app.csrf.generateToken(result.sessionId);
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.csrf}=${csrfToken}; Secure; SameSite=Strict; Max-Age=${ctx.app.config.sessionExpiryHours * 3600}`);

    return res;
  } catch (e: any) {
    if (e.message === "invalid_json_body") return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    ctx.app.log.error("MFA verify error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * POST /api/auth/mfa/setup
 */
export const handleMfaSetup: RouteHandler = async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

  if (!sessionId) return jsonErrorResponse({ message: "Session required", code: "NO_SESSION" }, 401);

  try {
    const user = await ctx.app.auth.getSession(sessionId);
    if (!user) return jsonErrorResponse({ message: "Invalid session", code: "INVALID_SESSION" }, 401);

    const result = await ctx.app.auth.setupMfa(user.id);
    return jsonOk({
      success: true,
      secret: result.secret,
      qrCode: result.qrCode,
    });
  } catch (e: any) {
    ctx.app.log.error("MFA setup error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};
