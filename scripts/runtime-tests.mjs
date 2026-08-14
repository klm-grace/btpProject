import http from "node:http";

const BASE = "http://127.0.0.1:4000";
const TOKEN = "test-monitoring-token";

const request = (opts) =>
  new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });

const check = (label, actual, expected) => {
  if (actual === expected) console.log(`  PASS  ${label}`);
  else console.log(`  FAIL  ${label}  actual=${actual}  expected=${expected}`);
};

const main = async () => {
  const headers = (extra = {}) => ({
    "x-monitoring-token": TOKEN,
    "Content-Type": "application/json",
    ...extra,
  });

  const r1 = await request({ hostname: "127.0.0.1", port: 4000, method: "GET", path: "/api/health", headers: headers() });
  check("/api/health status", r1.status, 200);
  check("/api/health has HSTS", r1.headers["strict-transport-security"]?.includes("31536000"), true);

  const r2 = await request({ hostname: "127.0.0.1", port: 4000, method: "GET", path: "/api/ready", headers: headers() });
  check("/api/ready status", r2.status, 200);

  const r3 = await request({ hostname: "127.0.0.1", port: 4000, method: "POST", path: "/api/auth/login", headers: headers(), body: JSON.stringify({ email: "test@test.com", password: "TestPass123!" }) });
  check("/api/auth/login status", r3.status, 401);

  const noToken = await request({ hostname: "127.0.0.1", port: 4000, method: "GET", path: "/api/health" });
  check("/api/health no-token forbidden", noToken.status, 403);

  const preflight = await request({ hostname: "127.0.0.1", port: 4000, method: "OPTIONS", path: "/api/health", headers: { origin: "http://localhost:3000", "access-control-request-method": "GET" } });
  check("OPTIONS preflight status", preflight.status, 204);
  check("OPTIONS preflight ACAO", preflight.headers["access-control-allow-origin"], "http://localhost:3000");

  const cssTestR = await request({ hostname: "127.0.0.1", port: 4000, method: "GET", path: "/api/css-test", headers: headers() });
  check("/api/css-test status", cssTestR.status, 404);
  check("/api/css-test security headers present", cssTestR.headers["x-frame-options"], "DENY");

  console.log("\nRuntime API verification complete.");
};

main().catch((e) => { console.error(e); process.exit(1); });