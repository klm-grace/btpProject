import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

/**
 * Comparaison de chaînes en temps constant.
 *
 * À utiliser pour TOUTE vérification de token (monitoring, API keys, webhooks,
 * sessions...) afin d'éviter les timing attacks.
 *
 * - Différence de longueur (en OCTETS UTF-8) → retourne `false` immédiatement.
 * - Longueurs égales → `crypto.timingSafeEqual` de node:crypto (natif).
 *
 * Note : on compare la longueur des octets encodés, pas des caractères —
 * `timingSafeEqual` natif exige des buffers de même taille.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);

  if (aBuf.byteLength !== bBuf.byteLength) return false;

  return nodeTimingSafeEqual(aBuf, bBuf);
}
