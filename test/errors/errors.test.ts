import { describe, expect, it } from "bun:test";
import {
  AppError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
  errorToHttpStatus,
  formatError,
  isHttpError,
} from "@libs/errors";

describe("errors", () => {
  it("AppError porte code + requestId", () => {
    const e = new AppError("boom", { code: "boom_code", requestId: "req-1" });
    expect(e.message).toBe("boom");
    expect(e.code).toBe("boom_code");
    expect(e.requestId).toBe("req-1");
  });

  it("valide le code par défaut", () => {
    const e = new AppError("x");
    expect(e.code).toBe("app_error");
  });

  it("les sous-classes HTTP portent leurs code/status", () => {
    expect(new ValidationError().status).toBe(400);
    expect(new ValidationError().code).toBe("validation_error");
    expect(new NotFoundError().status).toBe(404);
    expect(new NotFoundError().code).toBe("not_found");
    expect(new ConflictError().status).toBe(409);
    expect(new ConflictError().code).toBe("conflict");
    expect(new InternalError().status).toBe(500);
    expect(new InternalError().code).toBe("internal_error");
  });

  it("isHttpError / errorToHttpStatus", () => {
    expect(isHttpError(new NotFoundError())).toBe(true);
    expect(isHttpError(new Error("raw"))).toBe(false);
    expect(errorToHttpStatus(new NotFoundError())).toBe(404);
    expect(errorToHttpStatus(new AppError("a"))).toBe(400);
    expect(errorToHttpStatus(new Error("raw"))).toBe(500);
  });

  it("formatError n'expose jamais la cause brute (SQL/stack)", () => {
    const out = formatError(
      new InternalError("something failed", {
        cause: new Error("pg: FATAL password authentication failed"),
        requestId: "req-9",
      }),
      "req-9",
    );
    expect(out.status).toBe(500);
    expect(out.error.message).toBe("something failed");
    expect(out.error.requestId).toBe("req-9");
    expect(JSON.stringify(out)).not.toContain("FATAL");
    expect(JSON.stringify(out)).not.toContain("password");
  });

  it("formatError masque une erreur inconnue (pas de message technique)", () => {
    const out = formatError(new Error("connect ECONNREFUSED 127.0.0.1"));
    expect(out.status).toBe(500);
    expect(out.error.message).toBe("Internal server error");
    expect(JSON.stringify(out)).not.toContain("ECONNREFUSED");
  });

  it("formatError inclut les détails contextuels non sensibles", () => {
    const out = formatError(new ValidationError("Invalid", { context: { field: "email" } }));
    expect(out.error.details).toEqual({ field: "email" });
  });
});
