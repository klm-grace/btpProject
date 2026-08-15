/**
 * Handlers pour l'authentification de apps/api.
 */

import type { RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { COOKIE_NAMES, COOKIE_SETTINGS } from "../constants";
import { parseCookie } from "../utils/cookies";
import { getAppContext } from "../utils/context";
import { z } from "zod";

const EmailSchema = z.string().email().max(254);
const LoginBodySchema = z.object({
  email: z.string(),
  password: z.string(),
});
const ChangePasswordBodySchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
});

// --- Password Policy (OWASP ASVS V2.3 / NIST 800-63B) ---
const PasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password too long")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain a special character");

function validatePasswordPolicy(password: string): { valid: boolean; errors: string[] } {
  const result = PasswordSchema.safeParse(password);
  if (!result.success) {
    return { valid: false, errors: result.error.issues.map((i) => i.message) };
  }
  return { valid: true, errors: [] };
}

/**
 * POST /api/auth/login
 */
export const handleLogin: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = LoginBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonErrorResponse({ message: "Invalid request body", code: "INVALID_BODY" }, 400);
    }
    const { email, password } = parsed.data;

    // --- Validation stricte de l'email (DoS Redis) ---
    const validatedEmail = EmailSchema.safeParse(email);
    if (!validatedEmail.success) {
      return jsonErrorResponse({ message: "Invalid email format", code: "INVALID_EMAIL" }, 400);
    }
    const normalizedEmail = validatedEmail.data.toLowerCase().trim();

    if (!password) {
      return jsonErrorResponse({ message: "Password required", code: "MISSING_PASSWORD" }, 400);
    }

    const result = await app.auth.login(normalizedEmail, password);

    if (!result.success) {
      if (result.error === "mfa_required") {
        return jsonOk({
          success: true,
          mfa_required: true,
          pendingToken: (result as { pendingToken?: string }).pendingToken,
        });
      }
      // Log security event for failed login
      if (result.error === "invalid_credentials" || result.error === "brute_force_lockout") {
        await app.securityEvents.recordEvent({
          eventType: result.error === "brute_force_lockout" ? "brute_force_lockout" : "login_failed",
          ip: app.trustedProxy.getClientIp(req),
          userAgent: req.headers.get("user-agent"),
          details: { reason: result.error },
        });
      }
      return jsonErrorResponse({ message: result.error, code: "AUTH_FAILED" }, 401);
    }

    const res = jsonOk({ user: result.user });

    // Session cookie
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.session}=${result.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${app.config.sessionExpiryHours * 3600}`);

    // CSRF cookie (L'utilisateur doit pouvoir le lire, mais on ajoute Secure)
    const csrfToken = await app.csrf.generate();
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.csrf}=${csrfToken}; Secure; SameSite=Strict; Max-Age=${app.config.sessionExpiryHours * 3600}`);

    return res;
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "invalid_json_body") return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    app.log.error("Login error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * POST /api/auth/logout
 */
export const handleLogout: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  const cookieHeader = req.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

  if (sessionId) {
    await app.auth.logout(sessionId);
  }

  const res = jsonOk({});
  res.headers.append("Set-Cookie", `${COOKIE_NAMES.session}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  res.headers.append("Set-Cookie", `${COOKIE_NAMES.csrf}=; Secure; SameSite=Strict; Max-Age=0`);

  return res;
};

/**
 * GET /api/auth/me
 */
export const handleGetMe: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const cookieHeader = req.headers.get("cookie");
    const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

    if (!sessionId) {
      return jsonErrorResponse({ message: "Session required", code: "NO_SESSION" }, 401);
    }

    const user = await app.auth.getSession(sessionId);
    if (!user) {
      return jsonErrorResponse({ message: "Invalid or expired session", code: "INVALID_SESSION" }, 401);
    }

    return jsonOk({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        mfaEnabled: user.mfaEnabled,
      },
    });
  } catch (e: unknown) {
    app.log.error("Get me error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * POST /api/auth/change-password
 */
export const handleChangePassword: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const body = ctx.state.body as Record<string, unknown> ?? {};
    const parsed = ChangePasswordBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonErrorResponse({ message: "Invalid request body", code: "INVALID_BODY" }, 400);
    }
    const { currentPassword, newPassword } = parsed.data;

    // Validate password policy
    const pwdValidation = validatePasswordPolicy(newPassword);
    if (!pwdValidation.valid) {
      return jsonErrorResponse({ message: pwdValidation.errors[0] ?? "Invalid password", code: "INVALID_PASSWORD" }, 400);
    }

    const cookieHeader = req.headers.get("cookie");
    const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

    if (!sessionId) {
      return jsonErrorResponse({ message: "Session required", code: "NO_SESSION" }, 401);
    }

    const user = await app.auth.getSession(sessionId);
    if (!user) {
      return jsonErrorResponse({ message: "Invalid or expired session", code: "INVALID_SESSION" }, 401);
    }

    const result = await app.auth.changePassword(user.id, currentPassword, newPassword);
    if (!result.ok) {
      const code = result.error === "invalid_current_password" ? "WRONG_PASSWORD" : "INTERNAL_ERROR";
      return jsonErrorResponse({ message: "Password change failed", code }, 400);
    }

    // Token rotation : toutes les sessions sont révoquées par changePassword
    return jsonOk({ message: "Password changed successfully" });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "invalid_json_body") {
      return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    }
    app.log.error("Change password error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * GET /api/auth/csrf
 * Retourne un token CSRF frais pour les SPAs qui ne peuvent pas lire les cookies.
 */
export const handleGetCsrf: RouteHandler = async (req, ctx) => {
  const app = getAppContext(ctx);
  try {
    const token = app.csrf.generate();
    return jsonOk({ csrfToken: token });
  } catch (e: unknown) {
    app.log.error("Get CSRF error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};