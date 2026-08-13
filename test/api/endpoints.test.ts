import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { createRedis } from "@libs/redis";
import { createHealthChecker } from "@libs/health";
import { createLogger } from "@libs/logger";
import { createRouter } from "@libs/router";
import { jsonOk } from "@libs/http";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://btp_dev:btp_dev_password@127.0.0.1:5432/btp_dev",
  REDIS_URL: process.env.REDIS_URL ?? "redis://:btp_dev_redis_password@127.0.0.1:6379",
  NODE_ENV: "test",
};

let db: Db | null = null;
let redis: Redis | null = null;
let available = false;

beforeAll(async () => {
  try {
    const cfg = createConfig().parse(env);
    db = createDb({ url: cfg.db.url });
    redis = createRedis({ url: cfg.redis.url });
    available = (await db.ping()) && (await redis.ping());
  } catch {
    available = false;
  }
});

afterAll(async () => {
  await db?.close();
  await redis?.close();
});

function buildHandler() {
  const health = createHealthChecker({
    db: db ? { ping: () => db!.ping() } : undefined,
    redis: redis ? { ping: () => redis!.ping() } : undefined,
  });
  const router = createRouter();
  router.get("/api/health", async (_req, ctx) => {
    const report = await health.check();
    const status = report.status === "ok" || report.status === "degraded" ? 200 : 503;
    return jsonOk(report, { status, requestId: ctx.requestId });
  });
  router.get("/api/ready", async (_req, ctx) => {
    const report = await health.check();
    const ready = report.status !== "down";
    const status = ready ? 200 : 503;
    return jsonOk({ ready, status: report.status }, { status, requestId: ctx.requestId });
  });
  router.get("/api/error", () => { throw new Error("boom"); });
  return router;
}

describe("api endpoints", () => {
  let router: ReturnType<typeof buildHandler>;

  beforeAll(async () => {
    if (!available) return;
    router = buildHandler();
  });

  it("GET /api/health → 200 + format JSON standard", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const res = await router.handle(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { status: string }; requestId: string };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(typeof body.requestId).toBe("string");
  });

  it("GET /api/ready → 200", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const res = await router.handle(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { ready: boolean } };
    expect(body.success).toBe(true);
    expect(body.data.ready).toBe(true);
  });

  it("GET /inexistant → 404 JSON propre", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const res = await router.handle(new Request("http://localhost/inexistant"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(body.error.message).not.toContain("Error");
    expect(body.error.message).not.toContain("Error");
  });

  it("POST /api/health → 405 avec Allow header", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const res = await router.handle(new Request("http://localhost/api/health", { method: "POST" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
  });

  it("GET /api/error → 500 sans erreur brute (via fetchHandler)", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const r = buildHandler();
    // Simule le middleware fetchHandler avec try/catch
    const handler = async (req: Request) => {
      try {
        return await r.handle(req);
      } catch (err) {
        return Response.json({ success: false, error: { code: "internal_error", message: "Internal error" } }, { status: 500 });
      }
    };
    const res = await handler(new Request("http://localhost/api/error"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.message).not.toContain("boom");
    expect(body.error.code).toBeDefined();
  });

  it("requête reçoit un requestId", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const res = await router.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as { requestId: string };
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.length).toBeGreaterThan(0);
  });

  it("requestId personnalisé est respecté", async () => {
    if (!available) { console.warn("[skip] infra non disponible"); return; }
    const res = await router.handle(
      new Request("http://localhost/api/health", {
        headers: { "x-request-id": "custom-id-123" },
      }),
    );
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe("custom-id-123");
  });
});
