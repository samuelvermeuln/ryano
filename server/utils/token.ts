import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateRawToken(size = 32) {
  return randomBytes(size).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqualHash(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
