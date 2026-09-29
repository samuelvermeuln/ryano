/**
 * `loginAction` só pode responder "Muitas tentativas" quando o limite foi de
 * fato excedido. Uma falha do rate limiter (banco indisponível, DATABASE_URL
 * ausente) antes era engolida e exibida como limite, escondendo a causa real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/server/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/rate-limit")>()),
  assertRateLimit: mocks.assertRateLimit,
}));
vi.mock("@/server/db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/server/auth", () => ({ ensureUserScaffold: vi.fn() }));
vi.mock("@/server/auth-session", () => ({ createDatabaseSession: vi.fn() }));
vi.mock("@/server/services/password-reset-email", () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { loginAction } from "@/app/actions/auth";

function loginForm() {
  const form = new FormData();
  form.set("email", "atleta@example.com");
  form.set("password", "senha-valida-123");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
});

describe("loginAction — rate limit", () => {
  it("responde 'Muitas tentativas' quando o limite foi excedido", async () => {
    mocks.assertRateLimit.mockRejectedValue(new Error("RATE_LIMIT_EXCEEDED"));

    await expect(loginAction({}, loginForm())).resolves.toEqual({
      message: "Muitas tentativas. Aguarde alguns minutos.",
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("não mascara falha do rate limiter como 'Muitas tentativas'", async () => {
    mocks.assertRateLimit.mockRejectedValue(new Error("Environment variable not found: DATABASE_URL"));

    await expect(loginAction({}, loginForm())).rejects.toThrow("DATABASE_URL");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
