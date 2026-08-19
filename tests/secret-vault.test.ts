import { describe, expect, it } from "vitest";

describe("secret vault", () => {
  it("encrypts and decrypts value", async () => {
    process.env.DATA_ENCRYPTION_KEY = "test-encryption-key";

    const { decryptSecret, encryptSecret } = await import("@/server/crypto/secret-vault");
    const encrypted = encryptSecret("super-secret");

    expect(decryptSecret(encrypted)).toBe("super-secret");
  });
});
