/**
 * parser form — Secure parser pour application/x-www-form-urlencoded.
 *
 * Supporte les clés multiples, rejette les clés interdites (prototype pollution).
 */

import { PROHIBITED_KEYS, BODY_DEFAULTS } from "../types.ts";

/**
 * Parse une chaîne form-urlencoded en objet.
 *
 * Règles de sécurité :
 * - Rejette les clés contenant des null bytes
 * - Rejette les clés trop longues
 * - Rejette les clés interdites (prototype pollution)
 * - Limite le nombre de clés
 */
export function parseFormSafe(
  text: string,
  config: { maxBytes?: number; maxKeys?: number; keyMaxBytes?: number } = {},
): Record<string, string> {
  const maxBytes = config.maxBytes ?? BODY_DEFAULTS.formMaxBytes;
  const maxKeys = config.maxKeys ?? BODY_DEFAULTS.formMaxKeys;
  const keyMaxBytes = config.keyMaxBytes ?? BODY_DEFAULTS.formKeyMaxBytes;
  // Vérifie la taille
  if (text.length > maxBytes) {
    const err = new Error("FORM_TOO_LARGE") as Error & { code: string };
    err.code = "FORM_TOO_LARGE";
    throw err;
  }

  // Parse avec URLSearchParams
  const params = new URLSearchParams(text);

  // Vérifie null bytes dans les clés et valeurs
  for (const [key] of params.entries()) {
    if (key.includes("\0")) {
      const err = new Error("INVALID_FORM") as Error & { code: string };
      err.code = "INVALID_FORM";
      throw err;
    }
  }

  const result: Record<string, string> = {};
  let keyCount = 0;

  for (const [key, value] of params.entries()) {
    // Vérifie la longueur de la clé
    if (key.length > keyMaxBytes) {
      const err = new Error("FORM_KEY_TOO_LONG") as Error & { code: string };
      err.code = "FORM_KEY_TOO_LONG";
      throw err;
    }

    // Vérifie prototype pollution
    if (PROHIBITED_KEYS.has(key)) {
      const err = new Error("PROTOTYPE_POLLUTION") as Error & { code: string };
      err.code = "PROTOTYPE_POLLUTION";
      throw err;
    }

    // Limite le nombre de clés
    if (keyCount >= maxKeys) {
      const err = new Error("FORM_TOO_MANY_KEYS") as Error & { code: string };
      err.code = "FORM_TOO_MANY_KEYS";
      throw err;
    }

    result[key] = value;
    keyCount++;
  }

  return result;
}

/**
 * Transforme un objet form en objet imbriqué (supporte les clés type arr[].).
 * Ex: "items[]=a&items[]=b" → { items: ["a", "b"] }
 */
export function formToNested(
  flat: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    // Détecte les indices []
    const match = key.match(/^(.+)\[(\d*)\]$/);
    if (match) {
      const parentKey = match[1]!;
      const index = match[2]!;
      if (!result[parentKey]) {
        result[parentKey] = [];
      }
      const arr = result[parentKey] as string[];
      if (index === "") {
        arr.push(value);
      } else {
        arr[Number(index)] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}
