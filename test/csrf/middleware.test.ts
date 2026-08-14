import { describe, expect, it } from "bun:test";
import { createCsrf } from "@libs/csrf";
import { createRouter } from "@libs/router";
import { jsonOk } from "@libs/http";

function buildReq(method: string, url: string, headers?: Record<string, string>): Request {
  return new Request(url, { method, headers });
}

describe("csrf middleware", () => {
  const csrf = createCsrf();

  function makeRouter() {
    const router = createRouter();
    router.use(csrf.middleware);
    router.post("/api/mutation", () => jsonOk({ ok: true }));
    router.get("/api/lecture", () => jsonOk({ ok: true }));
    router.post("/api/auth/login", () => jsonOk({ ok: true })); // exempté par défaut
    router.post("/api/autre", () => jsonOk({ ok: true }));
    return router;
  }

  it("POST sans cookie ni header → 403 csrf_invalid", async () => {
    const router = makeRouter();
    const res = await router.handle(buildReq("POST", "http://localhost/api/mutation"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("csrf_invalid");
  });

  it("POST avec cookie mais sans header → 403", async () => {
    const router = makeRouter();
    const res = await router.handle(
      buildReq("POST", "http://localhost/api/mutation", { Cookie: "csrf_token=abc123" }),
    );
    expect(res.status).toBe(403);
  });

  it("POST avec header mais sans cookie → 403", async () => {
    const router = makeRouter();
    const res = await router.handle(
      buildReq("POST", "http://localhost/api/mutation", { "X-CSRF-Token": "abc123" }),
    );
    expect(res.status).toBe(403);
  });

  it("POST avec cookie + header identiques → 200", async () => {
    const router = makeRouter();
    const token = csrf.generate();
    const res = await router.handle(
      buildReq("POST", "http://localhost/api/mutation", {
        Cookie: `csrf_token=${token}`,
        "X-CSRF-Token": token,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("POST avec cookie + header différents → 403", async () => {
    const router = makeRouter();
    const token = csrf.generate();
    const other = csrf.generate();
    const res = await router.handle(
      buildReq("POST", "http://localhost/api/mutation", {
        Cookie: `csrf_token=${token}`,
        "X-CSRF-Token": other,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("GET n'est pas protégé (sans token) → 200", async () => {
    const router = makeRouter();
    const res = await router.handle(buildReq("GET", "http://localhost/api/lecture"));
    expect(res.status).toBe(200);
  });

  it("paths exemptés par préfixe ne sont pas protégés (login) → 200", async () => {
    const router = makeRouter();
    const res = await router.handle(buildReq("POST", "http://localhost/api/auth/login"));
    expect(res.status).toBe(200);
  });

  it("sous-arbre exempté par préfixe → 200 sans token", async () => {
    const csrf = createCsrf({ exemptedPrefixes: ["/api/public"] });
    const router = createRouter();
    router.use(csrf.middleware);
    router.post("/api/public/contact", () => jsonOk({ ok: true }));
    router.post("/api/public/quote", () => jsonOk({ ok: true }));
    const res = await router.handle(buildReq("POST", "http://localhost/api/public/contact"));
    expect(res.status).toBe(200);
  });

  it("autre POST non exempté sans token → 403", async () => {
    const router = makeRouter();
    const res = await router.handle(buildReq("POST", "http://localhost/api/autre"));
    expect(res.status).toBe(403);
  });
});
