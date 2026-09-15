import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { CoachProfileService, createCoachProfile } from "@/modules/school";

const profile = createCoachProfile({ id: "coach-id", userId: "user-id", displayName: "Coach" }, new Date("2026-09-09T10:00:00Z"));
const setup = () => {
  const findUnique = vi.fn();
  const service = new CoachProfileService({ findUnique } as Pick<PrismaClient["coachProfile"], "findUnique">);
  return { service, findUnique };
};

describe("CoachProfile resolution by User [T042]", () => {
  it.each(["ACTIVE", "INACTIVE", "SUSPENDED"])("returns a %s profile using only its user identity", async (status) => {
    const { service, findUnique } = setup();
    findUnique.mockResolvedValue({ ...profile, status });
    await expect(service.resolveByUserId(profile.userId)).resolves.toEqual({ ...profile, status });
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { userId: profile.userId } });
  });

  it("returns null without creating a profile when none exists", async () => {
    const { service, findUnique } = setup();
    findUnique.mockResolvedValue(null);
    await expect(service.resolveByUserId("missing-user")).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { userId: "missing-user" } });
  });

  it.each(["", " ", " padded "])("rejects invalid identity %j before persistence", async (userId) => {
    const { service, findUnique } = setup();
    await expect(service.resolveByUserId(userId)).rejects.toThrow(ZodError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("validates persisted data and preserves database failures", async () => {
    const { service, findUnique } = setup();
    findUnique.mockResolvedValue({ ...profile, status: "INVALID" });
    await expect(service.resolveByUserId(profile.userId)).rejects.toThrow(ZodError);
    const failure = new Error("database unavailable");
    findUnique.mockRejectedValue(failure);
    await expect(service.resolveByUserId(profile.userId)).rejects.toBe(failure);
  });
});
