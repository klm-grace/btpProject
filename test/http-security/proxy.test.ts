import { describe, expect, it } from "bun:test";
import { createTrustedProxy } from "@libs/http-security/proxy";

function fakeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:4000/test", { headers });
}

describe("trusted-proxy", () => {
  it("trustProxy=false → retourne null", () => {
    const proxy = createTrustedProxy({ trustProxy: false });
    const ip = proxy.getClientIp(fakeReq({ "X-Forwarded-For": "1.2.3.4" }));
    expect(ip).toBeNull();
  });

  it("trustProxy=true, X-Real-IP → retourne la première IP", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq({ "X-Real-IP": "203.0.113.50" }));
    expect(ip).toBe("203.0.113.50");
  });

  it("trustProxy=true, X-Forwarded-For → retourne la DERNIÈRE IP", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    // Premier = client direct (proxy), dernier = client réel
    const ip = proxy.getClientIp(fakeReq({
      "X-Forwarded-For": "10.0.0.1, 172.16.0.1, 203.0.113.50",
    }));
    expect(ip).toBe("203.0.113.50");
  });

  it("trustProxy=true, X-Forwarded-For avec une seule IP", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq({ "X-Forwarded-For": "203.0.113.50" }));
    expect(ip).toBe("203.0.113.50");
  });

  it("trustProxy=true, pas de headers → retourne null", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq());
    expect(ip).toBeNull();
  });

  it("trustProxy=true, X-Real-IP prioritaire sur X-Forwarded-For", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq({
      "X-Real-IP": "100.64.0.1",
      "X-Forwarded-For": "10.0.0.1, 203.0.113.50",
    }));
    expect(ip).toBe("100.64.0.1");
  });

  it("trustProxy=true, IPv6 dans X-Forwarded-For", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq({
      "X-Forwarded-For": "10.0.0.1, 2001:db8::1",
    }));
    expect(ip).toBe("2001:db8::1");
  });

  it("trustProxy=true, header invalide → retourne null", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq({ "X-Forwarded-For": "not-an-ip" }));
    expect(ip).toBeNull();
  });

  it("trustProxy=true, header vide → retourne null", () => {
    const proxy = createTrustedProxy({ trustProxy: true });
    const ip = proxy.getClientIp(fakeReq({ "X-Forwarded-For": "  ,  " }));
    expect(ip).toBeNull();
  });
});
