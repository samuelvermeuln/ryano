import { beforeEach, describe, expect, it, vi } from "vitest";

// SAM-14 — landing pós-login consolidado. Prisma, cookies e a flag do módulo
// escola são mockados para exercitar `resolveAuthenticatedLandingPath` e
// `listUserContexts` de forma determinística, sem banco nem env.
vi.mock("@/server/db", () => ({
  prisma: {
    schoolMembership: { findMany: vi.fn() },
    coachProfile: { findUnique: vi.fn() },
  },
}));

vi.mock("@/modules/school/config/feature-flag", () => ({
  isSchoolModuleEnabled: vi.fn(() => true),
}));

vi.mock("@/modules/school/config/marketplace-feature-flag", () => ({
  isMarketplaceEnabled: vi.fn(() => true),
}));

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/auth", () => ({ auth: vi.fn() }));
vi.mock("@/server/users/onboarding", () => ({ isOnboardingComplete: vi.fn(() => true) }));

import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { resolveAuthenticatedLandingPath } from "@/server/auth-guards";
import { listUserContexts } from "@/server/user-context";

const membershipsMock = vi.mocked(prisma.schoolMembership.findMany);
const coachProfileMock = vi.mocked(prisma.coachProfile.findUnique);
const isSchoolModuleEnabledMock = vi.mocked(isSchoolModuleEnabled);

const alpha = { schoolId: "school_alpha", school: { name: "Escola Alpha" } };
const beta = { schoolId: "school_beta", school: { name: "Escola Beta" } };
const coach = { id: "coach_1", displayName: "Carlos", status: "ACTIVE" };

let userCounter = 0;
/** `listUserContexts` usa `react.cache` por userId; cada caso usa um id novo para não herdar memoização. */
function session(overrides: Partial<{ role: string; onboardingComplete: boolean }> = {}) {
  userCounter += 1;
  return { user: { id: `user_${userCounter}`, role: "USER", onboardingComplete: true, ...overrides } };
}

describe("resolveAuthenticatedLandingPath (SAM-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSchoolModuleEnabledMock.mockReturnValue(true);
    membershipsMock.mockResolvedValue([] as never);
    coachProfileMock.mockResolvedValue(null);
    cookieStore.get.mockReturnValue(undefined);
  });

  it("returns null without a session", async () => {
    await expect(resolveAuthenticatedLandingPath(null as never)).resolves.toBeNull();
    expect(membershipsMock).not.toHaveBeenCalled();
  });

  it("keeps ADMIN and pending onboarding ahead of any context", async () => {
    await expect(resolveAuthenticatedLandingPath(session({ role: "ADMIN" }) as never)).resolves.toBe("/admin");
    await expect(
      resolveAuthenticatedLandingPath(session({ onboardingComplete: false }) as never),
    ).resolves.toBe("/onboarding");
    expect(membershipsMock).not.toHaveBeenCalled();
  });

  it("sends a plain athlete straight to the dashboard (single context, no picker)", async () => {
    await expect(resolveAuthenticatedLandingPath(session() as never)).resolves.toBe("/app/dashboard");
  });

  it("does not consult school data when the school module is off", async () => {
    isSchoolModuleEnabledMock.mockReturnValue(false);
    membershipsMock.mockResolvedValue([alpha] as never);

    await expect(resolveAuthenticatedLandingPath(session() as never)).resolves.toBe("/app/dashboard");
    expect(membershipsMock).not.toHaveBeenCalled();
    expect(coachProfileMock).not.toHaveBeenCalled();
  });

  it("shows the context picker to a multi-context account with no saved preference", async () => {
    membershipsMock.mockResolvedValue([alpha] as never);

    await expect(resolveAuthenticatedLandingPath(session() as never)).resolves.toBe("/contexto");
  });

  it("reuses a saved preference that still belongs to the account", async () => {
    membershipsMock.mockResolvedValue([alpha, beta] as never);
    coachProfileMock.mockResolvedValue(coach as never);
    cookieStore.get.mockReturnValue({ value: "school:school_beta" });

    await expect(resolveAuthenticatedLandingPath(session() as never)).resolves.toBe("/escola/school_beta");
  });

  it("rejects a saved context the account no longer has and falls back to the picker", async () => {
    membershipsMock.mockResolvedValue([alpha] as never);
    cookieStore.get.mockReturnValue({ value: "school:school_revoked" });

    await expect(resolveAuthenticatedLandingPath(session() as never)).resolves.toBe("/contexto");
  });

  it("ignores a malformed cookie value", async () => {
    membershipsMock.mockResolvedValue([alpha] as never);
    cookieStore.get.mockReturnValue({ value: "school:../../etc" });

    await expect(resolveAuthenticatedLandingPath(session() as never)).resolves.toBe("/contexto");
  });
});

describe("listUserContexts (SAM-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSchoolModuleEnabledMock.mockReturnValue(true);
    membershipsMock.mockResolvedValue([] as never);
    coachProfileMock.mockResolvedValue(null);
  });

  it("derives contexts from the real relations and sorts Escola > Professor > Atleta", async () => {
    membershipsMock.mockResolvedValue([beta, alpha] as never);
    coachProfileMock.mockResolvedValue(coach as never);

    const contexts = await listUserContexts("user_multi");

    expect(contexts.map((context) => context.key)).toEqual([
      "school:school_alpha",
      "school:school_beta",
      "professor",
      "athlete",
    ]);
    expect(membershipsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_multi",
          status: "ACTIVE",
          school: { status: "ACTIVE" },
          roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
        },
      }),
    );
  });

  it("includes Professor for any CoachProfile status — the professor screens handle PENDING/SUSPENDED", async () => {
    coachProfileMock.mockResolvedValue({ ...coach, status: "PENDING" } as never);

    const contexts = await listUserContexts("user_pending_coach");

    expect(contexts.map((context) => context.key)).toEqual(["professor", "athlete"]);
  });

  it("only offers Atleta when the school module is disabled", async () => {
    isSchoolModuleEnabledMock.mockReturnValue(false);

    await expect(listUserContexts("user_flag_off")).resolves.toEqual([{ type: "ATHLETE", key: "athlete" }]);
  });
});
