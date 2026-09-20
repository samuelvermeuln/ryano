import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted) -------------------------------------------------------
// Prisma and the school feature flag are mocked so resolveSmartLandingPath can
// be exercised deterministically and offline, without a real database or env.
vi.mock("@/server/db", () => ({
  prisma: {
    schoolMembership: {
      findFirst: vi.fn(),
    },
    coachProfile: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/modules/school/config/feature-flag", () => ({
  isSchoolModuleEnabled: vi.fn(() => true),
}));

import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { resolveSmartLandingPath } from "@/server/auth-guards";

const schoolMembershipFindFirstMock = vi.mocked(prisma.schoolMembership.findFirst);
const coachProfileFindFirstMock = vi.mocked(prisma.coachProfile.findFirst);
const isSchoolModuleEnabledMock = vi.mocked(isSchoolModuleEnabled);

type FakeSession = { user: { id: string } };

function session(userId = "user_1"): FakeSession {
  return { user: { id: userId } };
}

describe("resolveSmartLandingPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSchoolModuleEnabledMock.mockReturnValue(true);
    schoolMembershipFindFirstMock.mockResolvedValue(null);
    coachProfileFindFirstMock.mockResolvedValue(null);
  });

  it("returns null when there is no session user id", async () => {
    await expect(resolveSmartLandingPath(null as never)).resolves.toBeNull();
    await expect(resolveSmartLandingPath({ user: {} } as never)).resolves.toBeNull();
    expect(schoolMembershipFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns null when the school module feature flag is disabled, even with qualifying data", async () => {
    isSchoolModuleEnabledMock.mockReturnValue(false);
    schoolMembershipFindFirstMock.mockResolvedValue({ id: "membership_1" } as never);

    await expect(resolveSmartLandingPath(session() as never)).resolves.toBeNull();
    expect(schoolMembershipFindFirstMock).not.toHaveBeenCalled();
    expect(coachProfileFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns null for a plain aluno with no school or coach ties", async () => {
    await expect(resolveSmartLandingPath(session() as never)).resolves.toBeNull();
  });

  it("returns /escola when the account has an active OWNER/ADMIN membership at an active school", async () => {
    schoolMembershipFindFirstMock.mockResolvedValue({ id: "membership_1" } as never);

    await expect(resolveSmartLandingPath(session() as never)).resolves.toBe("/escola");
    expect(schoolMembershipFindFirstMock).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        status: "ACTIVE",
        school: { status: "ACTIVE" },
        roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
      },
      select: { id: true },
    });
  });

  it("returns /professor when the account has a coach profile, regardless of its status", async () => {
    coachProfileFindFirstMock.mockResolvedValue({ id: "coach_1" } as never);

    await expect(resolveSmartLandingPath(session() as never)).resolves.toBe("/professor");
    expect(coachProfileFindFirstMock).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      select: { id: true },
    });
  });

  it("prioritizes /escola over /professor when the account has both", async () => {
    schoolMembershipFindFirstMock.mockResolvedValue({ id: "membership_1" } as never);
    coachProfileFindFirstMock.mockResolvedValue({ id: "coach_1" } as never);

    await expect(resolveSmartLandingPath(session() as never)).resolves.toBe("/escola");
  });
});
