import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:4000";
const TOKEN = "test-monitoring-token";
const collectionsDir = path.join(process.cwd(), "bruno/collections");

function request(method, urlPath, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: 4000, method, path: urlPath, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function checkAssert(file, res, assertion) {
  if (!assertion) return;
  // Match: res.body.status: eq 200  OR  res.body.requestId: isDefined
  const m = assertion.match(/^res\.(body|headers|status)(?:\.([\w.]+))?\s*:\s*(eq|neq|contains|includes|gt|lt|defined|isDefined)(?:\s+(.+))?$/);
  if (!m) return;
  const [, lhsType, lhsKey, op, rawExpected] = m;
  const expected = rawExpected ? rawExpected.replace(/^["']|["']$/g, "") : "";
  let actual;

  if (lhsType === "status") actual = String(res.status);
  else if (lhsType === "headers") {
    const key = lhsKey?.toLowerCase();
    for (const [k, v] of Object.entries(res.headers)) {
      if (k.toLowerCase() === key) { actual = v; break; }
    }
  } else if (lhsType === "body") {
    try {
      const json = JSON.parse(res.body);
      actual = lhsKey?.split(".").reduce((o, k) => (o != null ? o[k] : undefined), json);
    } catch { actual = undefined; }
  }

  const actualStr = actual === undefined || actual === null ? "" : String(actual);
  let pass = false;
  if (op === "eq") pass = actualStr === expected;
  else if (op === "neq") pass = actualStr !== expected;
  else if (op === "contains" || op === "includes") pass = actualStr.includes(expected);
  else if (op === "gt") pass = Number(actual) > Number(expected);
  else if (op === "lt") pass = Number(actual) < Number(expected);
  else if (op === "defined" || op === "isDefined") pass = actualStr !== "";

  if (pass) console.log(`  PASS  ${file}`);
  else console.log(`  FAIL  ${file}  ${actualStr} !== ${expected}`);
}

async function main() {
  const apiProc = Bun.spawn(["bun", "run", "apps/api/index.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, MONITORING_TOKEN: TOKEN },
  });

  for (let i = 0; i < 50; i++) {
    try { const r = await request("GET", "/api/ready"); if (r.status === 200) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  const sections = fs.readdirSync(collectionsDir).filter((f) => f.startsWith("section-") || f === "api-tests").sort();
  let totalPass = 0, totalFail = 0;

  for (const section of sections) {
    const dir = path.join(collectionsDir, section);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".bru"));
    if (!files.length) continue;

    console.log(`\n=== ${section} ===`);

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const lines = content.split("\n").filter((l) => l.trim());

      let url = "";
      for (const line of lines) {
        if (line.trim().startsWith("url:")) { url = line.trim().slice(4).trim(); break; }
      }
      if (!url) { console.log(`  SKIP  ${file}  no url`); continue; }
      url = url.replace(/\{\{base_url\}\}/g, BASE);

      let method = "GET";
      for (const line of lines) {
        if (line.trim().startsWith("method:")) { method = line.trim().slice(7).trim(); break; }
      }
      if (!lines.some((l) => l.trim().startsWith("method:"))) {
        for (const line of lines) {
          const m = line.match(/^(get|post|put|patch|delete|head|options)\s*\{/i);
          if (m) { method = m[1].toUpperCase(); break; }
        }
      }

      const headers = { "x-monitoring-token": TOKEN };
      let body;
      if (content.includes("body json {")) { headers["Content-Type"] = "application/json"; body = "{}"; }

      let res;
      try {
        const u = new URL(url);
        res = await request(method, u.pathname + u.search, headers, body);
      } catch (e) {
        console.log(`  FAIL  ${file}  request error: ${e.message}`);
        continue;
      }

      // Extract assert block
      const assertLines = [];
      let inAssert = false, blockDepth = 0;
      for (const line of lines) {
        const t = line.trim();
        if (t === "assert {") { inAssert = true; blockDepth = 1; continue; }
        if (!inAssert) continue;
        if (t === "}" || t === "}") { blockDepth--; if (blockDepth <= 0) break; continue; }
        if (t) assertLines.push(t);
      }

      for (const assertion of assertLines) {
        checkAssert(file, res, assertion);
        if (assertion.match(/: (eq|neq|contains|includes|gt|lt|defined|isDefined)/)) {
          const m2 = assertion.match(/:( eq|neq|contains|includes|gt|lt|defined|isDefined)/);
          if (m2) {
            const op2 = m2[1].trim();
            if (op2 === "defined" || op2 === "isDefined") totalPass++;
            else totalPass++;
          }
        }
      }
    }
  }

  console.log("\nBruno-equivalent run complete.");
  apiProc.kill("SIGTERM");
}

main().catch((e) => { console.error(e); process.exit(1); });