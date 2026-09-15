import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ResolveInvitationLink } from "@/modules/school/application/resolve-invitation-link";
import { hashInvitationToken } from "@/modules/school/infrastructure/invitation-token";

const now = new Date("2026-09-14T12:00:00Z");
const available = {
  id: "invitation-1", type: "SCHOOL", schoolId: "school-1", coachId: null,
  requiresApproval: true, expiresAt: null, maxUses: null, usedCount: 0,
  status: "ACTIVE", revokedAt: null,
};

function setup(row: unknown = available) {
  const findUnique = vi.fn().mockResolvedValue(row);
  const update = vi.fn();
  const db = { invitationLink: { findUnique, update }, invitationUse: { create: vi.fn() } };
  return { db, findUnique, useCase: new ResolveInvitationLink(db as unknown as PrismaClient, () => now) };
}

describe("ResolveInvitationLink", () => {
  it.each([
    { type: "SCHOOL", schoolId: "school-1", coachId: null },
    { type: "SCHOOL_COACH", schoolId: "school-1", coachId: "coach-1" },
    { type: "COACH", schoolId: null, coachId: "coach-1" },
  ])("resolves $type without consuming a use or revealing credentials", async (scope) => {
    const row = { ...available, ...scope };
    const { useCase, findUnique, db } = setup(row);
    const result = await useCase.execute({ token: "presented-token" });
    expect(result).toEqual(row);
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashInvitationToken("presented-token") },
      select: {
        id: true, type: true, schoolId: true, coachId: true,
        requiresApproval: true, expiresAt: true, maxUses: true, usedCount: true,
        status: true, revokedAt: true,
      },
    });
    expect(result).not.toHaveProperty("tokenHash");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("createdBy");
    expect(db.invitationLink.update).not.toHaveBeenCalled();
    expect(db.invitationUse.create).not.toHaveBeenCalled();
  });

  it.each(["Token", "token", " token "])("hashes the exact token %j", async (token) => {
    const { useCase, findUnique } = setup(null);
    await expect(useCase.execute({ token })).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND", status: 404 });
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashInvitationToken(token) });
  });

  it.each([null, {}, { token: "" }, { token: 1 }, { token: "a".repeat(513) },
    { token: "token", tokenHash: "injected" }])("rejects invalid input before lookup", async (raw) => {
    const { useCase, findUnique } = setup();
    await expect(useCase.execute(raw)).rejects.toBeInstanceOf(ZodError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "REVOKED", revokedAt: now }, "INVITATION_REVOKED"],
    [{ revokedAt: now }, "INVITATION_REVOKED"],
    [{ status: "EXPIRED", expiresAt: new Date(now.getTime() + 1000) }, "INVITATION_EXPIRED"],
    [{ expiresAt: now }, "INVITATION_EXPIRED"],
    [{ expiresAt: new Date(now.getTime() - 1) }, "INVITATION_EXPIRED"],
    [{ status: "EXHAUSTED", maxUses: 1, usedCount: 1 }, "INVITATION_EXHAUSTED"],
    [{ maxUses: 2, usedCount: 2 }, "INVITATION_EXHAUSTED"],
    [{ maxUses: 2, usedCount: 3 }, "INVITATION_EXHAUSTED"],
  ])("rejects unavailable state %j without mutation", async (state, code) => {
    const { useCase, db } = setup({ ...available, ...state });
    await expect(useCase.execute({ token: "token" })).rejects.toMatchObject({ code, status: 409 });
    expect(db.invitationLink.update).not.toHaveBeenCalled();
    expect(db.invitationUse.create).not.toHaveBeenCalled();
  });

  it("accepts a link immediately before expiry and below the usage limit", async () => {
    const row = { ...available, expiresAt: new Date(now.getTime() + 1), maxUses: 2, usedCount: 1 };
    await expect(setup(row).useCase.execute({ token: "token" })).resolves.toEqual(row);
  });

  it("propagates persistence failures", async () => {
    const { useCase, findUnique } = setup();
    const failure = new Error("Database unavailable");
    findUnique.mockRejectedValue(failure);
    await expect(useCase.execute({ token: "token" })).rejects.toBe(failure);
  });
});
