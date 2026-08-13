import { describe, expect, it } from "bun:test";
import { createCors } from "@libs/http-security/cors";

function fakeReq(method = "GET", origin?: string, url = "http://localhost:4000/api/test"): Request {
  const headers: Record<string, string> = {};
  if (origin) headers["Origin"] = origin;
  return new Request(url, { method, headers });
}

const ALLOWED_ORIGINS = ["http://localhost:3000", "https://app.example.com"];

describe("cors", () => {
  it("origine autorisée → headers présents avec allow-origin", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000"));
    expect(result.allowed).toBe(true);
    expect(result.headers!["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(result.headers!["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("origine non autorisée → allowed=false", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const result = cors.resolve(fakeReq("GET", "https://evil.com"));
    expect(result.allowed).toBe(false);
  });

  it("pas d'origine (curl, server-to-server) → allowed=true, headers=null", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const result = cors.resolve(fakeReq("GET", undefined));
    expect(result.allowed).toBe(true);
    expect(result.headers).toBeNull();
  });

  it("credentials=true ajoute Access-Control-Allow-Credentials", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS, credentials: true });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000"));
    expect(result.allowed).toBe(true);
    expect(result.headers!["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("credentials=false (défaut) ne met PAS Allow-Credentials", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000"));
    expect(result.headers!["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("credentials=true + origine non autorisée → PAS de credentials exposé", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS, credentials: true });
    const result = cors.resolve(fakeReq("GET", "https://evil.com"));
    expect(result.allowed).toBe(false);
    expect(result.headers!["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("origine avec slash trailing est normalisée", () => {
    const cors = createCors({ origins: ["http://localhost:3000"] });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000/"));
    expect(result.allowed).toBe(true);
    expect(result.headers!["Access-Control-Allow-Origin"]).toBe("http://localhost:3000/");
  });

  it("methods personnalisées", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS, methods: ["GET", "POST"] });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000"));
    expect(result.headers!["Access-Control-Allow-Methods"]).toBe("GET, POST");
  });

  // Preflight
  it("preflight OPTIONS → réponse 204 avec headers CORS", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const res = cors.handlePreflight(fakeReq("OPTIONS", "http://localhost:3000"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
    expect(res!.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("preflight OPTIONS origine non autorisée → 403", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const res = cors.handlePreflight(fakeReq("OPTIONS", "https://evil.com"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("non-OPTIONS → handlePreflight retourne null", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS });
    const res = cors.handlePreflight(fakeReq("GET", "http://localhost:3000"));
    expect(res).toBeNull();
  });

  it("maxAge personnalisé est appliqué", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS, maxAge: 3600 });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000"));
    expect(result.headers!["Access-Control-Max-Age"]).toBe("3600");
  });

  it("exposedHeaders personnalisé", () => {
    const cors = createCors({ origins: ALLOWED_ORIGINS, exposedHeaders: ["X-Custom"] });
    const result = cors.resolve(fakeReq("GET", "http://localhost:3000"));
    expect(result.headers!["Access-Control-Expose-Headers"]).toBe("X-Custom");
  });
});
