import type { TrustedProxyConfig } from "./types.ts";

/**
 * Crée un extracteur d'IP client sécurisé.
 *
 * - Si `trustProxy: true` (derrière un reverse proxy) :
 *   prend le DERNIER élément de `X-Forwarded-For` (ou `X-Real-IP`).
 *   Jamais le premier — c'est le client direct, pas l'utilisateur final.
 * - Si `trustProxy: false` : retourne `null` (IP non disponible via Fetch API).
 *
 * Règle : ne JAMAIS faire confiance aveuglément à X-Forwarded-For.
 * On ne traite que les proxy de confiance (nginx, Caddy, Cloudflare).
 */
export function createTrustedProxy(config: TrustedProxyConfig) {
  const { trustProxy } = config;

  function getClientIp(req: Request): string | null {
    if (!trustProxy) return null;

    // X-Real-IP (prioritaire, fixé par nginx)
    const realIp = req.headers.get("x-real-ip");
    if (realIp) {
      const ip = realIp.split(",")[0]!.trim();
      if (ip && isValidIp(ip)) return ip;
    }

    // X-Forwarded-For : dernier élément = IP réelle du client
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",").map((p) => p.trim());
      // Prendre le dernier (IP la plus distante = client réel)
      const lastIp = parts[parts.length - 1];
      if (lastIp && isValidIp(lastIp)) return lastIp;
    }

    return null;
  }

  return { getClientIp };
}

/**
 * Validation IPv4 stricte (octets 0-255) + IPv6 basique.
 *
 * IPv4 : chaque octet doit être 0-255, pas de zéros de tête autorisés.
 * IPv6 : validation complète différée en section 13 (colonnes INET).
 */
function isValidIp(ip: string): boolean {
  // IPv4 stricte : 4 octets, chacun 0-255, sans zéros de tête
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return false;
    // Rejette les zéros de tête ("01.2.3.4" est ambigu)
    if (ipv4.slice(1).some((part) => part.length > 1 && part.startsWith("0"))) return false;
    return true;
  }
  // IPv6 : présence de deux-points + pas de caractères invalides
  // (validation RFC complète en section 13)
  if (ip.includes(":")) {
    return /^[0-9a-fA-F:]+$/.test(ip) && ip.split(":").length >= 3;
  }
  return false;
}
