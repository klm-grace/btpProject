import { describe, expect, it } from "bun:test";
import { createHealthChecker } from "@libs/health";

describe("health", () => {
  it("retourne ok quand aucune dépendance", async () => {
    const checker = createHealthChecker();
    const report = await checker.check();
    expect(report.status).toBe("ok");
    expect(report.dependencies).toEqual([]);
    expect(typeof report.uptime).toBe("number");
    expect(report.timestamp).toBeTruthy();
  });

  it("retourne ok quand toutes les dépendances répondent", async () => {
    const checker = createHealthChecker({
      db: { ping: async () => true },
      redis: { ping: async () => true },
    });
    const report = await checker.check();
    expect(report.status).toBe("ok");
    expect(report.dependencies).toHaveLength(2);
    expect(report.dependencies.every((d) => d.status === "ok")).toBe(true);
  });

  it("retourne degraded quand une dépendance est down", async () => {
    const checker = createHealthChecker({
      db: { ping: async () => true },
      redis: { ping: async () => false },
    });
    const report = await checker.check();
    expect(report.status).toBe("degraded");
    const redis = report.dependencies.find((d) => d.name === "redis");
    expect(redis?.status).toBe("down");
  });

  it("retourne down quand toutes les dépendances sont down", async () => {
    const checker = createHealthChecker({
      db: { ping: async () => false },
      redis: { ping: async () => false },
    });
    const report = await checker.check();
    expect(report.status).toBe("down");
  });

  it("gère une exception de ping sans exposer le détail technique", async () => {
    const checker = createHealthChecker({
      db: {
        ping: async () => {
          throw new Error("ECONNREFUSED 127.0.0.1:5432");
        },
      },
    });
    const report = await checker.check();
    expect(report.status).toBe("down");
    expect(report.dependencies[0]!.error).toBe("unavailable");
    expect(JSON.stringify(report)).not.toContain("ECONNREFUSED");
  });

  it("mesure la latence", async () => {
    const checker = createHealthChecker({
      db: {
        ping: async () => {
          await Bun.sleep(10);
          return true;
        },
      },
    });
    const report = await checker.check();
    expect(report.dependencies[0]!.latencyMs).toBeGreaterThanOrEqual(5);
  });
});
