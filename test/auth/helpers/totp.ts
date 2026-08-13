/**
 * Générateur TOTP de test (RFC 6238, HMAC-SHA1, 6 digits, période 30s).
 * Utilisé UNIQUEMENT par les tests pour valider le flow MFA.
 */
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(str: string): Buffer {
  const bits = str.toUpperCase().split("").map((c) => {
    const v = BASE32.indexOf(c);
    if (v === -1) throw new Error("caractère base32 invalide: " + c);
    return v.toString(2).padStart(5, "0");
  }).join("");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, periodSeconds = 0): string {
  const time = periodSeconds > 0
    ? Math.floor(periodSeconds / 30)
    : Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(time));
  const key = base32Decode(secret);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, "0");
}
