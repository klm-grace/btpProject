/**
 * parser XML — Parser XML SAX maison sécurisé.
 *
 * Ce parser ne supporte PAS :
 * - DOCTYPE (anti XXE)
 * - Entités externes (anti XXE)
 * - Processing instructions
 *
 * Il produit un objet JavaScript plat à partir du XML.
 * Supporte les attributs et les nœuds imbriqués.
 */

import { BODY_DEFAULTS } from "../types.ts";

/** Résultats du parsing XML. */
interface ParsedNode {
  name: string;
  attributes: Record<string, string>;
  children: ParsedNode[];
  text?: string;
}

/**
 * Vérifie les signes avant-coureurs d'attaques XML.
 * Bloque DOCTYPE, entités SYSTEM/PUBLIC, et encoding externe.
 */
export function validateXmlSafety(xml: string): void {
  const normalized = xml.toLowerCase();

  // Bloque DOCTYPE
  if (/<!doctype/i.test(normalized)) {
    const err = new Error("XML_DOCTYPE_NOT_ALLOWED") as Error & { code: string };
    err.code = "XML_DOCTYPE_NOT_ALLOWED";
    throw err;
  }

  // Bloque SYSTEM (entités externes)
  if (/system\s+["']/i.test(normalized)) {
    const err = new Error("XML_EXTERNAL_ENTITY_NOT_ALLOWED") as Error & { code: string };
    err.code = "XML_EXTERNAL_ENTITY_NOT_ALLOWED";
    throw err;
  }

  // Bloque PUBLIC (entités publiques)
  if (/public\s+["']/i.test(normalized)) {
    const err = new Error("XML_EXTERNAL_ENTITY_NOT_ALLOWED") as Error & { code: string };
    err.code = "XML_EXTERNAL_ENTITY_NOT_ALLOWED";
    throw err;
  }

  // Bloque les instructions processing (ex: <?xml ...)
  if (/<\?\w/.test(normalized)) {
    const err = new Error("XML_PROCESSING_INSTRUCTION_NOT_ALLOWED") as Error & { code: string };
    err.code = "XML_PROCESSING_INSTRUCTION_NOT_ALLOWED";
    throw err;
  }
}

/** Analyseur XML SAX simplifié (sans entités, sans DOCTYPE). */
class XmlSaxParser {
  private pos = 0;
  private xml: string;
  private maxDepth: number;
  private currentDepth = 0;
  private elementCount = 0;
  private maxElements: number;

  constructor(xml: string, maxDepth: number, maxElements: number) {
    this.xml = xml;
    this.maxDepth = maxDepth;
    this.maxElements = maxElements;
  }

  parse(): ParsedNode | null {
    this.skipWhitespace();
    if (this.pos >= this.xml.length) return null;

    if (this.xml.charAt(this.pos) !== "<") {
      // Texte seul → retourner un nœud texte
      const text = this.readText();
      if (!text.trim()) return null;
      return { name: "_text", attributes: {}, children: [], text };
    }

    return this.parseElement();
  }

  private skipWhitespace(): void {
    while (this.pos < this.xml.length && /\s/.test(this.xml[this.pos]!)) {
      this.pos++;
    }
  }

  private parseElement(): ParsedNode | null {
    if (this.pos >= this.xml.length || this.xml[this.pos]! !== "<") return null;
    this.pos++; // skip '<'

    // Lire le nom de l'élément
    const name = this.readName();
    if (!name) return null;

    // Vérifier la profondeur
    this.currentDepth++;
    if (this.currentDepth > this.maxDepth) {
      const err = new Error("XML_MAX_DEPTH") as Error & { code: string };
      err.code = "XML_MAX_DEPTH";
      throw err;
    }

    // Vérifier le compteur d'éléments
    this.elementCount++;
    if (this.elementCount > this.maxElements) {
      const err = new Error("XML_TOO_COMPLEX") as Error & { code: string };
      err.code = "XML_TOO_COMPLEX";
      throw err;
    }

    // Lire les attributs
    const attributes: Record<string, string> = {};
    while (this.pos < this.xml.length && this.xml.charAt(this.pos) !== ">" && this.xml.charAt(this.pos) !== "/") {
      this.skipWhitespace();
      const attrName = this.readName();
      if (!attrName) break;
      this.skipWhitespace();
      if (this.xml[this.pos]! === "=") {
        this.pos++;
        this.skipWhitespace();
        const attrValue = this.readAttributeValue();
        attributes[attrName] = attrValue;
      } else {
        attributes[attrName] = "";
      }
    }

    this.skipWhitespace();

    // Élément auto-fermant ?
    if (this.xml[this.pos]! === "/") {
      this.pos++;
      if (this.xml[this.pos]! !== ">") return null;
      this.pos++;
      this.currentDepth--;
      return { name, attributes, children: [], text: undefined };
    }

    if (this.xml[this.pos]! !== ">") return null;
    this.pos++; // skip '>'

    // Lire le contenu
    const children: ParsedNode[] = [];
    while (this.pos < this.xml.length) {
      this.skipWhitespace();

      if (this.pos >= this.xml.length) break;

      // Fin de l'élément
      if (this.xml[this.pos]! === "<" && this.xml[this.pos + 1]! === "/") {
        this.pos += 2;
        const closeName = this.readName();
        if (closeName !== name) {
          // Nommage incorrect → ignorer (pas de stack overflow)
          break;
        }
        this.skipWhitespace();
        if (this.xml[this.pos]! !== ">") return null;
        this.pos++;
        this.currentDepth--;
        break;
      }

      // Sous-élément
      if (this.xml[this.pos]! === "<") {
        const child = this.parseElement();
        if (child) children.push(child);
      } else {
        // Texte texte
        const text = this.readText();
        if (text.trim()) {
          children.push({ name: "_text", attributes: {}, children: [], text });
        }
      }
    }

    return { name, attributes, children };
  }

  private readName(): string {
    let name = "";
    while (this.pos < this.xml.length && /[a-zA-Z_:-\w]/.test(this.xml[this.pos]!)) {
      name += this.xml[this.pos]!;
      this.pos++;
    }
    return name;
  }

  private readAttributeValue(): string {
    if (this.pos >= this.xml.length) return "";
    const quote = this.xml[this.pos]!;
    if (quote !== '"' && quote !== "'") return "";
    this.pos++;
    let value = "";
    while (this.pos < this.xml.length && this.xml[this.pos]! !== quote) {
      if (this.xml[this.pos]! === "&") {
        // Entités HTML de base uniquement
        value += this.readEntity();
      } else {
        value += this.xml[this.pos]!;
        this.pos++;
      }
    }
    if (this.pos < this.xml.length) this.pos++; // skip closing quote
    return value;
  }

  private readEntity(): string {
    // Consommer le & initial
    if (this.pos >= this.xml.length || this.xml[this.pos]! !== "&") return "";
    this.pos++; // skip '&'

    // Lire le nom de l'entité (sans le ;)
    let entity = "";
    while (this.pos < this.xml.length && this.xml[this.pos]! !== ";" && /[a-zA-Z0-9#_]/.test(this.xml[this.pos]!)) {
      entity += this.xml[this.pos]!;
      this.pos++;
    }
    // Consommer le ; si présent
    if (this.pos < this.xml.length && this.xml[this.pos]! === ";") {
      this.pos++;
    }

    // Mapping basique des entités HTML
    const mappings: Record<string, string> = {
      "amp": "&",
      "lt": "<",
      "gt": ">",
      "quot": '"',
      "apos": "'",
    };

    // Décode les entités numériques décimales (&#60;) et hexadécimales (&#x3C;)
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      // Hex: &#x3C;
      const hexPart = entity.slice(2);
      const codePoint = parseInt(hexPart, 16);
      if (!isNaN(codePoint) && codePoint > 0 && codePoint < 0x110000) {
        return String.fromCodePoint(codePoint);
      }
    } else if (/^#[0-9]+$/.test(entity)) {
      // Decimal: &#60;
      const decPart = entity.slice(1);
      const codePoint = parseInt(decPart, 10);
      if (!isNaN(codePoint) && codePoint > 0 && codePoint < 0x110000) {
        return String.fromCodePoint(codePoint);
      }
    }

    return mappings[entity] ?? `&${entity};`;
  }

  private readText(): string {
    let text = "";
    while (this.pos < this.xml.length && this.xml[this.pos]! !== "<") {
      if (this.xml[this.pos]! === "&") {
        text += this.readEntity();
      } else {
        text += this.xml[this.pos]!;
        this.pos++;
      }
    }
    return text;
  }
}

/** Convertit un nœud SAX en objet JavaScript plat. */
function nodeToPlain(node: ParsedNode | null): Record<string, unknown> {
  if (!node) return {};

  // Noeud texte
  if (node.name === "_text") {
    return { _text: node.text ?? "" };
  }

  const result: Record<string, unknown> = { ...node.attributes };

  if (node.children.length === 0) {
    return result;
  }

  // Regrouper les enfants par nom
  const childrenMap: Record<string, unknown[]> = {};
  for (const child of node.children) {
    const childObj = nodeToPlain(child);
    for (const [key, value] of Object.entries(childObj)) {
      if (!childrenMap[key]) childrenMap[key] = [];
      childrenMap[key].push(value);
    }
  }

  // Si l'élément contient uniquement du texte (pas d'attributs, un seul enfant texte)
  if (
    node.children.length === 1 &&
    node.children[0]?.name === "_text" &&
    Object.keys(node.attributes).length === 0
  ) {
    // L'élément est un texte simple → stocker sous le nom de l'élément
    result[node.name] = node.children[0]!.text ?? "";
  } else {
    // Élément avec enfants ou attributs → flatten les clés
    for (const [key, values] of Object.entries(childrenMap)) {
      if (values.length === 1) {
        result[key] = values[0];
      } else {
        result[key] = values;
      }
    }
  }

  return result;
}

/**
 * Parse du XML de manière sécurisée.
 *
 * - Bloque DOCTYPE (anti XXE)
 * - Bloque entités SYSTEM/PUBLIC (anti XXE)
 * - Limite la profondeur (anti stack overflow)
 * - Limite le nombre d'éléments (anti billion laughs)
 */
export function parseXmlSafe(
  xml: string,
  config: { maxBytes?: number; maxDepth?: number; maxElements?: number } = {},
): Record<string, unknown> {
  const maxBytes = config.maxBytes ?? BODY_DEFAULTS.xmlMaxBytes;
  const maxDepth = config.maxDepth ?? BODY_DEFAULTS.xmlMaxDepth;
  const maxElements = config.maxElements ?? BODY_DEFAULTS.xmlMaxElements;
  // Vérifie la taille
  if (xml.length > maxBytes) {
    const err = new Error("XML_TOO_LARGE") as Error & { code: string };
    err.code = "XML_TOO_LARGE";
    throw err;
  }

  // Vérifie la sécurité (DOCTYPE, entités externes)
  validateXmlSafety(xml);

  // Parse avec le parser SAX
  const parser = new XmlSaxParser(xml, maxDepth, maxElements);
  const node = parser.parse();

  if (!node) {
    const err = new Error("INVALID_XML") as Error & { code: string };
    err.code = "INVALID_XML";
    throw err;
  }

  const result = nodeToPlain(node);

  // Striper le nom de l'élément racine (le root name n'est pas une clé utile)
  const rootName = node.name;
  if (Object.keys(result).length === 1 && rootName in result) {
    return result[rootName] as Record<string, unknown>;
  }
  return result;
}
