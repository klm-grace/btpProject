/**
 * Configuration des routes de l'API.
 */

import type { Router } from "@libs/router";
import type { AppContext } from "../types";
import { handleHealth, handleReady } from "../handlers/health";
import { handleLogin, handleLogout, handleGetMe, handleChangePassword, handleGetCsrf } from "../handlers/auth";
import { handleMfaVerify, handleMfaSetup } from "../handlers/mfa";
import { handleContactSubmit, handleQuoteSubmit } from "../handlers/public";
import { handleMediaUpload, handleMediaDelete } from "../handlers/media";
import {
  handleCategoryList,
  handleCategoryCreate,
  handleCategoryUpdate,
  handleCategoryDelete,
  handleProjectList,
  handleProjectGet,
  handleProjectCreate,
  handleProjectUpdate,
  handleProjectDelete,
  handleProjectPublish,
  handleProjectUnpublish,
  handleProjectAddImage,
  handleProjectUpdateImage,
  handleProjectDeleteImage,
  handleProjectAddCategory,
  handleProjectDeleteCategory,
} from "../handlers/portfolio";
import { sessionMiddleware } from "../middleware/session";
import { requireMonitoringAccess } from "../middleware/monitoring";
import { wrapHandler, wrapMiddleware } from "../utils/wrap";

export function registerRoutes(router: Router, ctx: AppContext) {
  // ── CSRF middleware global (toutes les mutations protégées) ───────────
  router.use(ctx.csrf.middleware);

  // --- Health ---
  router.get("/api/health", wrapMiddleware(requireMonitoringAccess), wrapHandler(handleHealth));
  router.get("/api/ready", wrapHandler(handleReady));

  // --- Auth (avec rate-limit strict) ---
  router.post("/api/auth/login", wrapMiddleware(ctx.authRateLimitMiddleware), wrapHandler(handleLogin));
  router.post("/api/auth/logout", wrapMiddleware(ctx.authRateLimitMiddleware), wrapHandler(handleLogout));
  router.get("/api/auth/csrf", wrapHandler(handleGetCsrf));
  router.get("/api/auth/me", wrapMiddleware(ctx.authRateLimitMiddleware), wrapMiddleware(sessionMiddleware), wrapHandler(handleGetMe));
  router.post("/api/auth/change-password", wrapMiddleware(ctx.authRateLimitMiddleware), wrapMiddleware(sessionMiddleware), wrapHandler(handleChangePassword));

  // --- MFA (avec rate-limit strict) ---
  router.post("/api/auth/mfa/setup", wrapMiddleware(ctx.authRateLimitMiddleware), wrapMiddleware(sessionMiddleware), wrapHandler(handleMfaSetup));
  router.post("/api/auth/mfa/verify", wrapMiddleware(ctx.authRateLimitMiddleware), wrapHandler(handleMfaVerify));

  // --- Formulaires publics (sans CSRF, rate-limit IP) ---
  router.post("/api/public/contact", wrapMiddleware(ctx.publicRateLimitMiddleware), wrapHandler(handleContactSubmit));
  router.post("/api/public/quote", wrapMiddleware(ctx.publicRateLimitMiddleware), wrapHandler(handleQuoteSubmit));

  // --- Médias (upload, protégé session) ---
  router.post(
    "/api/media",
    wrapMiddleware(ctx.authRateLimitMiddleware),
    wrapMiddleware(sessionMiddleware),
    wrapHandler(handleMediaUpload),
  );
  router.delete(
    "/api/media/:id",
    wrapMiddleware(ctx.authRateLimitMiddleware),
    wrapMiddleware(sessionMiddleware),
    wrapHandler(handleMediaDelete),
  );

  // --- Portfolio: Catégories ---
  router.get("/api/admin/categories", wrapMiddleware(sessionMiddleware), wrapHandler(handleCategoryList));
  router.post("/api/admin/categories", wrapMiddleware(sessionMiddleware), wrapHandler(handleCategoryCreate));
  router.put("/api/admin/categories/:id", wrapMiddleware(sessionMiddleware), wrapHandler(handleCategoryUpdate));
  router.delete("/api/admin/categories/:id", wrapMiddleware(sessionMiddleware), wrapHandler(handleCategoryDelete));

  // --- Portfolio: Projets ---
  router.get("/api/admin/projects", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectList));
  router.get("/api/admin/projects/:id", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectGet));
  router.post("/api/admin/projects", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectCreate));
  router.put("/api/admin/projects/:id", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectUpdate));
  router.delete("/api/admin/projects/:id", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectDelete));
  router.post("/api/admin/projects/:id/publish", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectPublish));
  router.post("/api/admin/projects/:id/unpublish", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectUnpublish));
  router.post("/api/admin/projects/:id/images", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectAddImage));
  router.put("/api/admin/projects/:id/images/:imageId", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectUpdateImage));
  router.delete("/api/admin/projects/:id/images/:imageId", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectDeleteImage));
  router.post("/api/admin/projects/:id/categories", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectAddCategory));
  router.delete("/api/admin/projects/:id/categories/:categoryId", wrapMiddleware(sessionMiddleware), wrapHandler(handleProjectDeleteCategory));
}
