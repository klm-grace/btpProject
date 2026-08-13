import { describe, expect, it } from "bun:test";
import { createRouter } from "@libs/router";
import { jsonOk } from "@libs/http";
import type { Middleware } from "@libs/router/types";

function buildReq(method: string, url: string, headers?: Record<string, string>): Request {
  return new Request(url, { method, headers });
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("router middlewares", () => {
  it("exécute un middleware avant le handler", async () => {
    const calls: string[] = [];
    const mw: Middleware = async (_req, _ctx, next) => {
      calls.push("mw");
      return next();
    };
    const router = createRouter({ middleware: [mw] });
    router.get("/api/x", () => {
      calls.push("handler");
      return jsonOk({ ok: true });
    });
    const res = await router.handle(buildReq("GET", "http://localhost/api/x"));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["mw", "handler"]);
  });

  it("court-circuite la chaîne quand le middleware retourne une Response", async () => {
    const calls: string[] = [];
    const auth: Middleware = () => json(401, { success: false, error: { code: "unauthorized" } });
    const mw2: Middleware = async (_req, _ctx, next) => {
      calls.push("mw2");
      return next();
    };
    const router = createRouter({ middleware: [auth, mw2] });
    router.get("/api/secret", () => {
      calls.push("handler");
      return jsonOk({ secret: 1 });
    });
    const res = await router.handle(buildReq("GET", "http://localhost/api/secret"));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]); // ni mw2 ni handler ne tournent
  });

  it("le middleware peut stocker des données dans ctx.state", async () => {
    const inject: Middleware = async (_req, ctx, next) => {
      ctx.state.user = { id: "u1", name: "Admin" };
      return next();
    };
    const router = createRouter({ middleware: [inject] });
    let seenUser: unknown = null;
    router.get("/api/me", (_req, ctx) => {
      seenUser = ctx.state.user;
      return jsonOk({ user: ctx.state.user });
    });
    const res = await router.handle(buildReq("GET", "http://localhost/api/me"));
    expect(res.status).toBe(200);
    expect(seenUser).toEqual({ id: "u1", name: "Admin" });
  });

  it("les middlewares s'exécutent dans l'ordre d'inscription", async () => {
    const order: string[] = [];
    const mw = (name: string): Middleware => async (_req, _ctx, next) => {
      order.push(name);
      return next();
    };
    const router = createRouter({ middleware: [mw("a"), mw("b"), mw("c")] });
    router.get("/api/x", () => jsonOk({ ok: true }));
    await router.handle(buildReq("GET", "http://localhost/api/x"));
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("use() ajoute un middleware global après coup", async () => {
    const calls: string[] = [];
    const router = createRouter();
    router.use(async (_req, _ctx, next) => {
      calls.push("use");
      return next();
    });
    router.get("/api/y", () => {
      calls.push("handler");
      return jsonOk({ ok: true });
    });
    const res = await router.handle(buildReq("GET", "http://localhost/api/y"));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["use", "handler"]);
  });
});
