/**
 * Handlers pour l'authentification de apps/api.
 */

import type { RouteContext, RouteHandler } from "../types";
import { jsonOk, jsonErrorResponse } from "@libs/http";
import { COOKIE_NAMES, COOKIE_SETTINGS } from "../constants";
import { parseCookie } from "../utils/cookies";
import { z } from "zod";

const EmailSchema = z.string().email().max(254);

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
    return { valid: false, errors: result.error.issues.map((i: any) => i.message) };
  }
  return { valid: true, errors: [] };
}

/**
 * POST /api/auth/login
 */
export const handleLogin: RouteHandler = async (req, ctx) => {
  try {
    const body = await import("../utils/body").then(m => m.readJsonBody(req));
    const { email, password } = body;

    // --- CORRECTION AUDIT : Validation stricte de l'email (DoS Redis) ---
    const validatedEmail = EmailSchema.safeParse(email);
    if (!validatedEmail.success) {
      return jsonErrorResponse({ message: "Invalid email format", code: "INVALID_EMAIL" }, 400);
    }
    const normalizedEmail = validatedEmail.data.toLowerCase().trim();

    if (!password) {
      return jsonErrorResponse({ message: "Password required", code: "MISSING_PASSWORD" }, 400);
    }

    const result = await ctx.app.auth.login(normalizedEmail, password);

    if (!result.success) {
      if (result.error === "mfa_required") {
        return jsonOk({
          success: true,
          mfa_required: true,
          pendingToken: result.pendingToken,
        });
      }
      return jsonErrorResponse({ message: result.error, code: "AUTH_FAILED" }, 401);
    }

    const res = jsonOk({ success: true, user: result.user });
    
    // Session cookie
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.session}=${result.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${ctx.app.config.sessionExpiryHours * 3600}`);
    
    // CSRF cookie (L'utilisateur doit pouvoir le lire, mais on ajoute Secure)
    const csrfToken = await ctx.app.csrf.generate();
    res.headers.append("Set-Cookie", `${COOKIE_NAMES.csrf}=${csrfToken}; Secure; SameSite=Strict; Max-Age=${ctx.app.config.sessionExpiryHours * 3600}`);

    return res;
  } catch (e: any) {
    if (e.message === "invalid_json_body") return jsonErrorResponse({ message: "Invalid JSON", code: "INVALID_JSON" }, 400);
    ctx.app.log.error("Login error", { error: e });
    return jsonErrorResponse({ message: "Internal Server Error", code: "INTERNAL_ERROR" }, 500);
  }
};

/**
 * POST /api/auth/logout
 */
export const handleLogout: RouteHandler = async (req, ctx) => {
  const cookieHeader = req.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader, COOKIE_NAMES.session);

  if (sessionId) {
    await ctx.app.auth.logout(sessionId);
  }

  const res = jsonOk({ success: true });
  res.headers.append("Set-Cookie", `${COOKIE_NAMES.session}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  res.headers.append("Set-Cookie", `${COOKIE_NAMES.csrf}=; Secure; SameSite=Strict; Max-Age=0`);
  
  return res;
};
