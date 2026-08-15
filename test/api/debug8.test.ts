import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createConfig } from "@libs/config";
import { createDb } from "@libs/db";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";
let cookies: Record<string, string> = {};
let db: ReturnType<typeof createDb> | null = null;

function cookieHeader(): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

beforeAll(async () => {
  const server = await getTestServer();
  baseUrl = server.baseUrl;
  
  // Also get direct DB access
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: "test",
  };
  const config = createConfig().parse(env);
  db = createDb(config.db);
  
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  for (const part of (loginRes.headers.get("set-cookie") ?? "").split(", ")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      cookies[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).split(";")[0]?.trim() ?? "";
    }
  }
});

afterAll(async () => {
  await releaseTestServer();
  if (db) await db.close();
});

describe("DEBUG8", () => {
  it("check company_profile table", async () => {
    const rows = await db!.sql`SELECT * FROM company_profile`;
    console.log("company_profile rows:", rows);
    
    const cols = await db!.sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'company_profile'`;
    console.log("columns:", cols);
  });

  it("check services table", async () => {
    const cols = await db!.sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'services'`;
    console.log("services columns:", cols);
  });

  it("check team_members table", async () => {
    const cols = await db!.sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'team_members'`;
    console.log("team_members columns:", cols);
  });

  it("check content_sections table", async () => {
    const cols = await db!.sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'content_sections'`;
    console.log("content_sections columns:", cols);
  });

  it("check seo_metas table", async () => {
    const cols = await db!.sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'seo_metas'`;
    console.log("seo_metas columns:", cols);
  });

  it("check settings table", async () => {
    const cols = await db!.sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'settings'`;
    console.log("settings columns:", cols);
  });

  it("company PUT manual SQL", async () => {
    // Try direct SQL insert
    try {
      await db!.sql.unsafe(`
        INSERT INTO company_profile (id, name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Test Direct', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `);
      console.log("Direct insert: OK");
    } catch (e) {
      console.log("Direct insert error:", (e as Error).message);
    }
    
    // Try the handler's query
    try {
      const existing = await db!.sql`
        SELECT id, name, tagline, description, address, phone, email, website, social_links
        FROM company_profile
        ORDER BY created_at DESC
        LIMIT 1
      `;
      console.log("Existing row:", existing);
    } catch (e) {
      console.log("Query error:", (e as Error).message);
    }
  });
});
