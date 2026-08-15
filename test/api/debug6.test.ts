import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";

let baseUrl = "";

beforeAll(async () => {
  const server = await getTestServer();
  baseUrl = server.baseUrl;
});

afterAll(async () => {
  await releaseTestServer();
});

describe("DEBUG6 - DB schema", () => {
  it("check tables exist", async () => {
    // The test server should have migrations run
    // Let's check by hitting a simple endpoint
    const res = await fetch(`${baseUrl}/api/admin/services`);
    console.log("Services list:", res.status);
    
    const res2 = await fetch(`${baseUrl}/api/admin/team`);
    console.log("Team list:", res2.status);
    
    const res3 = await fetch(`${baseUrl}/api/admin/content-sections`);
    console.log("Content sections:", res3.status);
    
    const res4 = await fetch(`${baseUrl}/api/admin/settings`);
    console.log("Settings:", res4.status);
    
    const res5 = await fetch(`${baseUrl}/api/admin/seo-metas`);
    console.log("SEO metas:", res5.status);
    
    const res6 = await fetch(`${baseUrl}/api/admin/company`);
    console.log("Company:", res6.status);
  });
});
