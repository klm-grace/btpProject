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

/** Validation simple d'IPv4/IPv6 (ne couvre pas tous les cas, suffisant pour un header). */
function isValidIp(ip: string): boolean {
  // IPv4 simple
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  // IPv6 (contient au moins deux points)
  if (ip.includes(":")) return true;
  return false;
}
