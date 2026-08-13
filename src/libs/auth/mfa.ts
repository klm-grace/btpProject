/**
 * MFA TOTP (Time-based One-Time Password).
 *
 * - Génération de secret cryptographiquement sûr (RFC 4226/RFC 6238).
 * - Vérification TOTP avec fenêtre ±1 pas de 30 secondes.
 * - URI otpauth:// pour QR code.
 * - Pas de dépendance externe : implémentation complète via Bun/Node crypto.
 */

import { timingSafeEqual } from "node:crypto";

const TOTP_PERIOD = 30; // secondes par pas
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // ±1 pas (±30 secondes)

/**
 * Génère un secret TOTP de 20 octets (160 bits) en base32.
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Génère l'URI otpauth:// pour un QR code.
 */
export function getOtpauthUri(secret: string, email: string, issuer: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Vérifie un code TOTP.
 * Utilise une fenêtre de ±1 pas (±30 secondes) pour compenser le décalage horloge.
 */
export function verifyCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const epoch = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(epoch / TOTP_PERIOD);

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const step = currentStep + i;
    const expected = generateCode(secret, step);
    if (timingSafeCompare(code, expected)) return true;
  }
  return false;
}

/**
 * Génère le code TOTP pour un pas donné (RFC 6238 avec HMAC-SHA1).
 */
function generateCode(secret: string, step: number): string {
  const key = base32Decode(secret);
  const time = new Uint8Array(8);
  let tmp = step;
  for (let i = 7; i >= 0; i--) {
    time[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }

  // HMAC-SHA1
  const hmac = hmacSha1(key, time);
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * HMAC-SHA1 pur (sans dépendance externe, Bun supporte SubtleCrypto).
 */
async function hmacSha1Raw(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, data);
}

/**
 * HMAC-SHA1 synchronisé (pour les tests).
 * Utilise Bun.password.hash en mode custom ? Non — on utilise une implémentation
 * pure pour les petits inputs TOTP.
 *
 * Alternative : Bun.CryptoHasher (natif, synchronisé).
 */
function hmacSha1(key: Uint8Array, data: Uint8Array): Uint8Array {
  const hasher = new Bun.CryptoHasher("sha1", key);
  hasher.update(data);
  const digest = hasher.digest();
  return new Uint8Array(digest);
}

// ── Comparaison en temps constant ────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}

// ── Base32 (RFC 4648) ────────────────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str: string): Uint8Array {
  let bits = "";
  for (const c of str.toUpperCase()) {
    const val = BASE32_CHARS.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}
