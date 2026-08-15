/**
 * parser text — Parser pour text/plain.
 *
 * Stocke le texte brut dans ctx.state.body comme { _text: "..." }.
 */

import { BODY_DEFAULTS } from "../types.ts";

/**
 * Parse du texte brut avec vérification de taille.
 */
export function parseTextSafe(
  text: string,
  config: { maxBytes?: number } = {},
): string {
  const maxBytes = config.maxBytes ?? BODY_DEFAULTS.textMaxBytes;
  if (text.length > maxBytes) {
    const err = new Error("TEXT_TOO_LARGE") as Error & { code: string };
    err.code = "TEXT_TOO_LARGE";
    throw err;
  }
  return text;
}
