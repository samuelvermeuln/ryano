import { describe, expect, it } from "vitest";

import { buildPasswordResetEmail } from "@/server/services/password-reset-email";

describe("password reset email", () => {
  it("builds email content with reset link", () => {
    const result = buildPasswordResetEmail({
      name: "Samuel Vermeuln",
      resetUrl: "https://app.ryano.dev/redefinir-senha?token=abc123",
      expiresAt: new Date("2026-08-19T12:00:00.000Z"),
    });

    expect(result.subject).toContain("Redefinição de senha");
    expect(result.text).toContain("abc123");
    expect(result.html).toContain("redefinir-senha?token=abc123");
    expect(result.text).toContain("Olá, Samuel");
  });
});
