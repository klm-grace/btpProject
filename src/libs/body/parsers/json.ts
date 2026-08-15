/**
 * parser JSON — Secure JSON parser avec profondeur max et prototype pollution.
 *
 * Ce parser ne dépend d'aucune bibliothèque externe.
 */

import { PROHIBITED_KEYS, BODY_DEFAULTS } from "../types.ts";

/** Erreur personnalisée pour la profondeur JSON maximale. */
class JsonDepthError extends Error {
  constructor() {
    super("JSON_MAX_DEPTH");
    this.name = "JsonDepthError";
  }
}

/**
 * Vérifie la profondeur de syntaxe d'une chaîne JSON avant parsing.
 * Compte les `{`, `[`, `}`, `]` pour déterminer la profondeur maximale atteinte.
 * Ignore les chaînes et les échappements.
 */
export function checkJsonDepth(text: string, maxDepth: number): void {
  let depth = 0;
  let maxSeen = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{" || ch === "[") {
      depth++;
      if (depth > maxDepth) throw new JsonDepthError();
      maxSeen = Math.max(maxSeen, depth);
    } else if (ch === "}" || ch === "]") {
      depth--;
    }
  }
}

/**
 * Vérifie la présence de clés interdites (prototype pollution).
 * Explore récursivement l'objet parse.
 */
export function hasPrototypePollution(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object") return false;

  // Vérifier les propriétés own
  const keys = Object.getOwnPropertyNames(obj as Record<string, unknown>);
  if (keys.some((k) => PROHIBITED_KEYS.has(k))) return true;

  // Explorer les valeurs récursivement
  for (const key of keys) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object") {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (hasPrototypePollution(item)) return true;
        }
      } else {
        if (hasPrototypePollution(val)) return true;
      }
    }
  }

  return false;
}

/**
 * Parse du JSON de manière sécurisée.
 * Lève une erreur avec un code spécifique en cas de problème.
 */
export function parseJsonSafe(
  text: string,
  config: { maxBytes?: number; maxDepth?: number } = {},
): Record<string, unknown> {
  const maxBytes = config.maxBytes ?? BODY_DEFAULTS.jsonMaxBytes;
  const maxDepth = config.maxDepth ?? BODY_DEFAULTS.jsonMaxDepth;

  // Vérifie la taille
  if (text.length > maxBytes) {
    const err = new Error("BODY_TOO_LARGE") as Error & { code: string };
    err.code = "BODY_TOO_LARGE";
    throw err;
  }

  // Texte vide → objet vide
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  // Vérifie la profondeur
  try {
    checkJsonDepth(trimmed, maxDepth);
  } catch {
    const err = new Error("JSON_MAX_DEPTH") as Error & { code: string };
    err.code = "JSON_MAX_DEPTH";
    throw err;
  }

  // Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const err = new Error("INVALID_JSON") as Error & { code: string };
    err.code = "INVALID_JSON";
    throw err;
  }

  // Vérifie que le résultat est un objet (pas un tableau, string, number...)
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const err = new Error("INVALID_JSON") as Error & { code: string };
    err.code = "INVALID_JSON";
    throw err;
  }

  // Vérifie prototype pollution
  if (hasPrototypePollution(parsed)) {
    const err = new Error("PROTOTYPE_POLLUTION") as Error & { code: string };
    err.code = "PROTOTYPE_POLLUTION";
    throw err;
  }

  return parsed as Record<string, unknown>;
}