import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { requireEnv } from "@/server/env";

const KEY_VERSION = 1;
const ALGORITHM = "aes-256-gcm";

function getKey() {
  const rawKey = requireEnv("DATA_ENCRYPTION_KEY");
  return createHash("sha256").update(rawKey).digest();
}

export type EncryptedSecret = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

export function encryptSecret(value: string): EncryptedSecret {
  const key = getKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptSecret(input: EncryptedSecret) {
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(input.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
