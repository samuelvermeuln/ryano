import { decryptSecret, encryptSecret, type EncryptedSecret } from "@/server/crypto/secret-vault";

type PasswordResetAccessPayload = {
  identifier: string;
  code: string;
  expiresAt: string;
};

export function createPasswordResetAccessToken(input: {
  identifier: string;
  code: string;
  expiresAt: Date;
}) {
  const encrypted = encryptSecret(
    JSON.stringify({
      identifier: input.identifier,
      code: input.code,
      expiresAt: input.expiresAt.toISOString(),
    } satisfies PasswordResetAccessPayload),
  );

  return Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url");
}

export function readPasswordResetAccessToken(token: string) {
  try {
    const encrypted = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as EncryptedSecret;
    const payload = JSON.parse(decryptSecret(encrypted)) as Partial<PasswordResetAccessPayload>;

    if (
      typeof payload.identifier !== "string" ||
      typeof payload.code !== "string" ||
      typeof payload.expiresAt !== "string"
    ) {
      return null;
    }

    return {
      identifier: payload.identifier,
      code: payload.code,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}
