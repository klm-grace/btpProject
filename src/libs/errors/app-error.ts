/** Classe de base des erreurs applicatives. */
export class AppError extends Error implements AppErrorFields {
  readonly code: string;
  readonly requestId?: string;
  readonly context?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.code = options.code ?? "app_error";
    this.requestId = options.requestId;
    this.context = options.context;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Erreur portant un statut HTTP explicite et un code machine. */
export class HttpError extends AppError {
  readonly status: number;

  constructor(status: number, message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? `http_${status}` });
    this.name = "HttpError";
    this.status = status;
  }
}

/** Erreur de validation des entrées (Zod). */
export class ValidationError extends HttpError {
  constructor(message = "Invalid input", options: AppErrorOptions = {}) {
    super(400, message, { ...options, code: options.code ?? "validation_error" });
    this.name = "ValidationError";
  }
}

/** Ressource introuvable. */
export class NotFoundError extends HttpError {
  constructor(message = "Resource not found", options: AppErrorOptions = {}) {
    super(404, message, { ...options, code: options.code ?? "not_found" });
    this.name = "NotFoundError";
  }
}

/** Conflit d'état (ex. doublon, ressource déjà existante). */
export class ConflictError extends HttpError {
  constructor(message = "Conflict", options: AppErrorOptions = {}) {
    super(409, message, { ...options, code: options.code ?? "conflict" });
    this.name = "ConflictError";
  }
}

/** Erreur interne (500) — à logger mais jamais à exposer telle quelle. */
export class InternalError extends HttpError {
  constructor(message = "Internal server error", options: AppErrorOptions = {}) {
    super(500, message, { ...options, code: options.code ?? "internal_error" });
    this.name = "InternalError";
  }
}
