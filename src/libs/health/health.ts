/**
 * Agrège l'état de santé des dépendances (DB, Redis, process).
 * Ne lit jamais process.env, n'ouvre aucun port.
 */
export function createHealthChecker(deps: HealthCheckerDeps = {}): HealthChecker {
  const startedAt = Date.now();

  async function checkDependency(
    name: string,
    pingFn: () => Promise<boolean>,
  ): Promise<DependencyHealth> {
    const t0 = performance.now();
    try {
      const ok = await pingFn();
      const latencyMs = Math.round(performance.now() - t0);
      return {
        name,
        status: ok ? "ok" : "down",
        latencyMs,
        ...(ok ? {} : { error: "ping failed" }),
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - t0);
      return {
        name,
        status: "down",
        latencyMs,
        error: "unavailable",
      };
    }
  }

  async function check(): Promise<HealthReport> {
    const checks: Promise<DependencyHealth>[] = [];

    if (deps.db) {
      checks.push(checkDependency("postgresql", () => deps.db!.ping()));
    }
    if (deps.redis) {
      checks.push(checkDependency("redis", () => deps.redis!.ping()));
    }

    const dependencies = await Promise.all(checks);

    let status: HealthStatus = "ok";
    if (dependencies.some((d) => d.status === "down")) {
      status = dependencies.every((d) => d.status === "down") ? "down" : "degraded";
    }

    return {
      status,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  return { check };
}
