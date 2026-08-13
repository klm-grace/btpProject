import { describe, expect, it } from "bun:test";
import { createSecurityHeaders } from "@libs/http-security/security-headers";

function fakeRes(): Response {
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
}

describe("security-headers", () => {
  it("applique les headers par défaut (CSP strict, HSTS, DENY frame)", () => {
    const sec = createSecurityHeaders();
    const res = sec.applyHeaders(fakeRes());
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("buildHeaders retourne un objet de headers", () => {
    const sec = createSecurityHeaders();
    const h = sec.buildHeaders();
    expect(typeof h["Strict-Transport-Security"]).toBe("string");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("permet de personnaliser la CSP et le frameOptions", () => {
    const sec = createSecurityHeaders({
      csp: "script-src 'self'",
      frameOptions: "SAMEORIGIN",
    });
    const res = sec.applyHeaders(fakeRes());
    expect(res.headers.get("content-security-policy")).toBe("script-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("n'écrase pas les headers existants de la réponse", () => {
    const res = new Response("ok", { status: 200, headers: { "x-custom": "v" } });
    const sec = createSecurityHeaders();
    const patched = sec.applyHeaders(res);
    expect(patched.headers.get("x-custom")).toBe("v");
    expect(patched.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("ne met pas Permissions-Policy si non défini", () => {
    const sec = createSecurityHeaders();
    const h = sec.buildHeaders();
    expect(h["Permissions-Policy"]).toBeUndefined();
  });

  it("Permissions-Policy est définie si fournie", () => {
    const sec = createSecurityHeaders({ permissionsPolicy: "camera=()" });
    const h = sec.buildHeaders();
    expect(h["Permissions-Policy"]).toBe("camera=()");
  });
});
