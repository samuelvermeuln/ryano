import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ExpireInvitations } from "@/modules/school/application/expire-invitations";

const now = new Date("2026-09-15T12:00:00Z");

function setup(clock = vi.fn(() => now)) {
  const updateMany = vi.fn().mockResolvedValue({ count: 3 });
  const db = { invitationLink: { updateMany } };
  return { updateMany, clock, useCase: new ExpireInvitations(db as unknown as PrismaClient, clock) };
}

describe("ExpireInvitations", () => {
  it("atomically expires due ACTIVE rows without loading credentials or changing usage/history", async () => {
    const { useCase, updateMany, clock } = setup();
    await expect(useCase.execute()).resolves.toEqual({ expiredCount: 3 });
    expect(clock).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { status: "ACTIVE", revokedAt: null, expiresAt: { lte: now }, updatedAt: { lte: now } },
      data: { status: "EXPIRED", updatedAt: now },
    });
  });

  it("returns zero when nothing is due or another worker already expired the rows", async () => {
    const { useCase, updateMany } = setup();
    updateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValue({ count: 0 });
    await expect(useCase.execute()).resolves.toEqual({ expiredCount: 3 });
    await expect(useCase.execute()).resolves.toEqual({ expiredCount: 0 });
  });

  it("refreshes the cutoff each run while using one timestamp per update", async () => {
    const later = new Date(now.getTime() + 1000);
    const { useCase, updateMany } = setup(vi.fn().mockReturnValueOnce(now).mockReturnValueOnce(later));
    await useCase.execute();
    await useCase.execute();
    expect(updateMany.mock.calls[1][0]).toMatchObject({
      where: { expiresAt: { lte: later }, updatedAt: { lte: later } },
      data: { updatedAt: later },
    });
  });

  it("rejects an invalid clock before writing", async () => {
    const { useCase, updateMany } = setup(vi.fn(() => new Date(NaN)));
    await expect(useCase.execute()).rejects.toBeInstanceOf(ZodError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("propagates persistence failure so the job can retry", async () => {
    const { useCase, updateMany } = setup();
    const failure = new Error("Database unavailable");
    updateMany.mockRejectedValue(failure);
    await expect(useCase.execute()).rejects.toBe(failure);
  });
});
