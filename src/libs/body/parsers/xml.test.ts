import { describe, expect, it } from "bun:test";
import { parseXmlSafe, validateXmlSafety } from "./xml.ts";

describe("parser XML", () => {
  it("parse un XML simple", () => {
    const xml = "<root><name>Jean</name></root>";
    const result = parseXmlSafe(xml);
    expect(result).toBeDefined();
    expect(result.name).toBe("Jean");
  });

  it("parse un XML avec attributs", () => {
    const xml = '<root><item id="1">valeur</item></root>';
    const result = parseXmlSafe(xml);
    expect(result).toBeDefined();
  });

  it("rejette XML trop profond", () => {
    const deep = "<a>".repeat(20) + "text" + "</a>".repeat(20);
    expect(() => parseXmlSafe(deep, { maxDepth: 5 })).toThrow("XML_MAX_DEPTH");
  });

  it("rejette XML trop complexe (trop d'éléments)", () => {
    const many = Array.from({ length: 1500 }, (_, i) => `<item>${i}</item>`).join("");
    const xml = `<root>${many}</root>`;
    expect(() => parseXmlSafe(xml, { maxElements: 1000 })).toThrow("XML_TOO_COMPLEX");
  });

  it("rejette XML trop large", () => {
    const xml = "<root>" + "x".repeat(200) + "</root>";
    expect(() => parseXmlSafe(xml, { maxBytes: 50 })).toThrow("XML_TOO_LARGE");
  });
});

describe("validateXmlSafety", () => {
  it("accepte XML normal", () => {
    expect(() => validateXmlSafety("<root><name>Jean</name></root>")).not.toThrow();
  });

  it("rejette XML avec DOCTYPE", () => {
    expect(() => validateXmlSafety('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>'))
      .toThrow("XML_DOCTYPE_NOT_ALLOWED");
  });

  it("rejette entité SYSTEM après DOCTYPE", () => {
    // DOCTYPE est rejeté avant d'arriver à SYSTEM
    expect(() => validateXmlSafety('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://evil.com">]>'))
      .toThrow("XML_DOCTYPE_NOT_ALLOWED");
  });

  it("rejette instruction processing", () => {
    expect(() => validateXmlSafety('<?xml version="1.0"?><root/></root>'))
      .toThrow("XML_PROCESSING_INSTRUCTION_NOT_ALLOWED");
  });

  it("rejette PUBLIC après DOCTYPE", () => {
    expect(() => validateXmlSafety('<!DOCTYPE foo [<!ENTITY xxe PUBLIC "foo" "bar">]>'))
      .toThrow("XML_DOCTYPE_NOT_ALLOWED");
  });
});

describe("billion laughs attack", () => {
  it("rejette XML avec trop d'éléments imbriqués", () => {
    // Simulation d'une attaque billion laughs (profondeur ok, mais trop d'éléments)
    const xml = '<root>' + Array.from({ length: 1500 }, () => '<a/>').join("") + '</root>';
    expect(() => parseXmlSafe(xml, { maxDepth: 100, maxElements: 1000 })).toThrow("XML_TOO_COMPLEX");
  });
});
