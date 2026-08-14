/**
 * MFA TOTP (Time-based One-Time Password).
 * Implémente la RFC 6238.
 */

import { createHmac, randomBytes } from "node:crypto";
import type { Redis } from "@libs/redis";

const TOTP_PERIOD = 30; 
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; 

export function generateSecret(): string {
  const buf = randomBytes(20);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < buf.length; i++) {
    const val = buf.readUInt8(i) % alphabet.length;
    secret += alphabet[val];
  }
  return secret;
}

export function getOtpauthUri(secret: string, email: string, issuer: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

export async function verifyCode(
  secret: string, 
  code: string, 
  userId: string, 
  redis: Redis 
): Promise<boolean> {
  const cleanCode = code.replace(/\s+/g, "");
  if (cleanCode.length !== TOTP_DIGITS) return false;

  const epoch = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(epoch / TOTP_PERIOD);

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const step = currentStep + i;
    const expected = generateOTP(secret, step);
    
    if (expected === cleanCode) {
      const lockKey = `mfa:used_step:${userId}:${step}`;
      const alreadyUsed = await redis.get(lockKey);
      if (alreadyUsed) return false; 
      
      await redis.set(lockKey, "1", TOTP_PERIOD * 3);
      return true;
    }
  }

  return false;
}

function generateOTP(secret: string, step: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const decoded = Buffer.alloc(16);
  let bitBuffer = 0;
  let bitCount = 0;
  let index = 0;

  for (let i = 0; i < secret.length; i++) {
    const char = secret[i]?.toUpperCase();
    if (!char) throw new Error("Invalid secret");
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error("Invalid base32 secret");
    bitBuffer = (bitBuffer << 5) | val;
    bitCount += 5;
    if (bitCount >= 8) {
      decoded[index++] = (bitBuffer >> (bitCount - 8)) & 0xFF;
      bitCount -= 8;
    }
  }

  const key = decoded;
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(step >>> 0, 4);

  const hmac = createHmac("sha1", key).update(msg).digest();
  
  const hmacLen = hmac.length;
  const offset = hmac.readUInt8(hmacLen - 1) & 0x0f;
  
  const b0 = hmac.readUInt8(offset) & 0x7f;
  const b1 = hmac.readUInt8(offset + 1) & 0xff;
  const b2 = hmac.readUInt8(offset + 2) & 0xff;
  const b3 = hmac.readUInt8(offset + 3) & 0xff;

  const binary = (
    (b0 << 24) |
    (b1 << 16) |
    (b2 << 8) |
    b3
  ) >>> 0;

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, "0");
}
