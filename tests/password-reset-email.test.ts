import { describe, expect, it } from "vitest";

import { buildPasswordResetEmail } from "@/server/services/password-reset-email";

describe("password reset email", () => {
  it("builds email content with recovery code", () => {
    const result = buildPasswordResetEmail({
      name: "Samuel Vermeuln",
      resetCode: "123456",
      resetPageUrl: "https://app.ryvano.dev/redefinir-senha?acesso=opaque-token",
      prefilledResetPageUrl: "https://app.ryvano.dev/redefinir-senha?acesso=opaque-token",
      expiresAt: new Date("2026-08-19T12:00:00.000Z"),
    });

    expect(result.subject).toContain("Redefinição de senha");
    expect(result.text).toContain("123456");
    expect(result.html).toContain("123456");
    expect(result.html).toContain("redefinir-senha");
    expect(result.html).toContain("acesso=opaque-token");
    expect(result.html).toContain("Usar código deste e-mail");
    expect(result.text).toContain("Olá, Samuel");
  });
});
