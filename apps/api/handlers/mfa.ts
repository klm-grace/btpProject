/**
 * Handlers pour le MFA (Multi-Factor Authentication) de apps/api.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { COOKIE_NAMES } from "../constants";
import { parseCookie } from "../utils/cookies";
import { getAppContext } from "../utils/context";
import { z } from "zod";

const MfaBodySchema = z.object({
  token: z.string(),
  code: z.string(),
});

/**
 * POST /api/auth/mfa/verify
 */
export const handleMfaVerify: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = MfaBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonErrorResponse({ message: "Invalid request body", code: "INVALID_BODY" }, 400);
    }
    const { token, code } = parsed.data;

    if (!token || !code) {
      return jsonErrorResponse({ message: "Token and code are required", code: "MISSING_PARAMS" }, 400);
    }

    const user = await app.auth.getSession(token);
    if (!user) {
      return jsonErrorResponse({ message: "Invalid session", code: "INVALID_SESSION" }, 401);
    }

    const verified = await app.auth.verifyMfa(user.id, code);
    if (!verified) {
      return jsonErrorResponse({ message: "Invalid MFA code", code: "MFA_FAILED" }, 401);
    }

    // MFA vérifié avec succès — on renvoie un nouveau token de session
    const loginResult = await app.auth.completeMfaLogin(token, code, {
      ip: app.trustedProxy.getClientIp(req) ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    if (!loginResult.success) {
      return jsonErrorResponse({ message: loginResult.error, code: "AUTH_FAILED" }, 401);
    }

    const res = jsonOk({ success: true, user: loginResult.user });
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.session}=${loginResult.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${app.config.sessionExpiryHours * 3600}`);

    const csrfToken = await app.csrf.generate();
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.csrf}=${csrfToken}; Secure; SameSite=Strict; Max-Age=${app.config.sessionExpiryHours * 3600}`);

    return res;
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "invalid_json_body") return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    app.log.error("MFA verify error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * POST /api/auth/mfa/setup
 */
export const handleMfaSetup: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const cookieHeader = req.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

  if (!sessionId) return jsonErrorResponse({ message: "Session required", code: "NO_SESSION" }, 401);

  try {
    const user = await app.auth.getSession(sessionId);
    if (!user) return jsonErrorResponse({ message: "Invalid session", code: "INVALID_SESSION" }, 401);

    const result = await app.auth.setupMfa(user.id);
    return jsonOk({
      success: true,
      secret: result.secret,
      otpauthUri: result.otpauthUri,
      qrCodeDataUri: result.qrCodeDataUri,
    });
  } catch (e: unknown) {
    app.log.error("MFA setup error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};