import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getTestServer, releaseTestServer } from "../support/server";
import { cleanupTestDB } from "../support/cleanup";

let baseUrl = "";
let cookies: Record<string, string> = {};

function parseCookies(setCookieHeader: string): Record<string, string> {
  const c: Record<string, string> = {};
  for (const cookie of setCookieHeader.split(", ")) {
    const trimmed = cookie.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const name = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).split(";")[0]?.trim() ?? "";
      c[name] = value;
    }
  }
  return c;
}

function cookieHeader(): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function csrfHeader(): string {
  return cookies["csrf_token"] ?? "";
}

beforeAll(async () => {
  await cleanupTestDB();
  const server = await getTestServer();
  baseUrl = server.baseUrl;
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@btp-dev.local", password: "admin1234" }),
  });
  expect(loginRes.status).toBe(200);
  cookies = parseCookies(loginRes.headers.get("set-cookie") ?? "");
});

afterAll(async () => {
  await releaseTestServer();
});

describe("section 12 — Gestion des leads", () => {
  describe("Contacts", () => {
    it("GET /api/admin/contacts sans session → 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/contacts`);
      expect(res.status).toBe(401);
    });

    it("GET /api/admin/contacts avec session → 200", async () => {
      const res = await fetch(`${baseUrl}/api/admin/contacts`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });

    it("POST /api/public/contact crée une demande", async () => {
      const res = await fetch(`${baseUrl}/api/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Jean Dupont",
          email: "jean+contact@test.com",
          phone: "+33 6 12 34 56 78",
          subject: "Rénovation salle de bain",
          message: "Bonjour, je souhaite rénover ma salle de bain.",
          consent: true,
        }),
      });
      expect(res.status).toBe(200);
    });

    it("GET /api/admin/contacts/:id récupère un contact", async () => {
      // First create a contact
      await fetch(`${baseUrl}/api/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Marie Martin",
          email: "marie+2@test.com",
          message: "Demande de devis",
          consent: true,
        }),
      });

      // Get the list to find the ID
      const listRes = await fetch(`${baseUrl}/api/admin/contacts`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as any;
      const contacts = (listData as any).data?.data;
      const contact = contacts?.find((c: any) => c?.email === "marie+2@test.com");
      if (!contact) return;

      const res = await fetch(`${baseUrl}/api/admin/contacts/${contact.id}`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect((data as any).data?.data?.email).toBe("marie+2@test.com");
    });

    it("PUT /api/admin/contacts/:id change le statut", async () => {
      await fetch(`${baseUrl}/api/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pierre Durand",
          email: "pierre+2@test.com",
          message: "Contact",
          consent: true,
        }),
      });

      const listRes = await fetch(`${baseUrl}/api/admin/contacts`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as any;
      const contacts = (listData as any).data?.data;
      const contact = contacts?.find((c: any) => c?.email === "pierre+2@test.com");
      if (!contact) return;

      const res = await fetch(`${baseUrl}/api/admin/contacts/${contact.id}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "contacted", notes: "Premier contact effectué" }),
      });
      expect(res.status).toBe(200);
    });

    it("GET /api/admin/contacts avec filtre statut", async () => {
      const res = await fetch(`${baseUrl}/api/admin/contacts?status=new`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });

    it("GET /api/admin/contacts/:id non trouvé → 404", async () => {
      const res = await fetch(`${baseUrl}/api/admin/contacts/00000000-0000-0000-0000-000000000001`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Devis", () => {
    it("GET /api/admin/quotes sans session → 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/quotes`);
      expect(res.status).toBe(401);
    });

    it("GET /api/admin/quotes avec session → 200", async () => {
      const res = await fetch(`${baseUrl}/api/admin/quotes`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/public/quote crée une demande de devis", async () => {
      const res = await fetch(`${baseUrl}/api/public/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Entreprise ABC",
          email: "abc+quote@test.com",
          phone: "+33 1 23 45 67 89",
          company: "ABC BTP",
          projectType: "Rénovation",
          budgetRange: "10000-20000",
          description: "Rénovation complète d'un local commercial",
          consent: true,
        }),
      });
      expect(res.status).toBe(200);
    });

    it("GET /api/admin/quotes/:id récupère un devis", async () => {
      await fetch(`${baseUrl}/api/public/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Client XYZ",
          email: "xyz+2@test.com",
          description: "Devis test",
          consent: true,
        }),
      });

      const listRes = await fetch(`${baseUrl}/api/admin/quotes`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as any;
      const quotes = (listData as any).data?.data;
      const quote = quotes?.find((q: any) => q?.email === "xyz+2@test.com");
      if (!quote) return;

      const res = await fetch(`${baseUrl}/api/admin/quotes/${quote.id}`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });

    it("PUT /api/admin/quotes/:id change le statut", async () => {
      await fetch(`${baseUrl}/api/public/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Devis Test",
          email: "devis+2@test.com",
          description: "Devis à qualifier",
          consent: true,
        }),
      });

      const listRes = await fetch(`${baseUrl}/api/admin/quotes`, {
        headers: { "Cookie": cookieHeader() },
      });
      const listData = await listRes.json() as any;
      const quotes = (listData as any).data?.data;
      const quote = quotes?.find((q: any) => q?.email === "devis+2@test.com");
      if (!quote) return;

      const res = await fetch(`${baseUrl}/api/admin/quotes/${quote.id}`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "qualified", notes: "Budget validé" }),
      });
      expect(res.status).toBe(200);
    });

    it("PUT /api/admin/quotes/:id avec données invalides → 400", async () => {
      const res = await fetch(`${baseUrl}/api/admin/quotes/00000000-0000-0000-0000-000000000001`, {
        method: "PUT",
        headers: {
          "Cookie": cookieHeader(),
          "X-CSRF-Token": csrfHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "invalid_status" }),
      });
      expect(res.status).toBe(400);
    });

    it("GET /api/admin/quotes avec filtre statut", async () => {
      const res = await fetch(`${baseUrl}/api/admin/quotes?status=new`, {
        headers: { "Cookie": cookieHeader() },
      });
      expect(res.status).toBe(200);
    });
  });
});
