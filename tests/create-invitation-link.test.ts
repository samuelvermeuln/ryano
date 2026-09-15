import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { CreateInvitationLink } from "@/modules/school/application/create-invitation-link";
import type { InvitationLink } from "@/modules/school/domain/invitation-link";
import { hashInvitationToken } from "@/modules/school/infrastructure/invitation-token";

const now = new Date("2026-09-14T12:00:00Z");
const schoolInput = { type: "SCHOOL", schoolId: "school-1" };

function setup() {
  const tx = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school-1", status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue({
      id: "member-1", schoolId: "school-1", userId: "actor-1", status: "ACTIVE", endedAt: null,
    }) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "member-1", role: "ADMIN" }]) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", userId: "actor-1", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-member-1" }) },
    invitationLink: { create: vi.fn().mockImplementation(async ({ data }: { data: InvitationLink }) => {
      const { tokenHash, ...publicData } = data;
      void tokenHash;
      return publicData;
    }) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new CreateInvitationLink(db as unknown as PrismaClient, () => now) };
}

describe("CreateInvitationLink", () => {
  it("creates a school invitation with server actor, safe defaults and only a stored SHA-256 hash", async () => {
    const { useCase, tx, db } = setup();
    const result = await useCase.execute("actor-1", schoolInput);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.invitationLink.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      tokenHash: hashInvitationToken(result.token), createdBy: "actor-1", type: "SCHOOL",
      schoolId: "school-1", coachId: null, requiresApproval: true, expiresAt: null,
      maxUses: null, usedCount: 0, status: "ACTIVE", createdAt: now, updatedAt: now, revokedAt: null,
    }) }));
    const data = tx.invitationLink.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("token");
    expect(JSON.stringify(data)).not.toContain(result.token);
    expect(result.invitation).not.toHaveProperty("tokenHash");
    expect(tx.invitationLink.create.mock.calls[0][0].select).not.toHaveProperty("tokenHash");
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("allows a coach to create their own independent invitation and preserves supplied limits", async () => {
    const { useCase, tx } = setup();
    const result = await useCase.execute("actor-1", {
      type: "COACH", coachId: "coach-1", requiresApproval: false,
      expiresAt: "2026-10-01T12:00:00Z", maxUses: 3,
    });
    expect(result.invitation).toMatchObject({
      type: "COACH", schoolId: null, coachId: "coach-1", requiresApproval: false,
      expiresAt: new Date("2026-10-01T12:00:00Z"), maxUses: 3,
    });
    expect(tx.school.findUnique).not.toHaveBeenCalled();
    expect(tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it("allows a school manager to invite for another coach actively linked to that school", async () => {
    const { useCase, tx } = setup();
    tx.coachProfile.findUnique.mockResolvedValue({ id: "coach-1", userId: "other-user", status: "ACTIVE" });
    await useCase.execute("actor-1", { type: "SCHOOL_COACH", schoolId: "school-1", coachId: "coach-1" });
    expect(tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({
      where: { schoolId: "school-1", coachId: "coach-1", status: "ACTIVE", endedAt: null }, select: { id: true },
    });
  });

  it.each([null, "", " actor-1"])("rejects unauthenticated actor %s before database access", async (actor) => {
    const { useCase, db } = setup();
    await expect(useCase.execute(actor, schoolInput)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { ...schoolInput, createdBy: "victim" },
    { ...schoolInput, roles: ["OWNER"] },
    { ...schoolInput, token: "chosen-token" },
    { ...schoolInput, tokenHash: "chosen-hash" },
    { ...schoolInput, usedCount: 1 },
    { ...schoolInput, maxUses: 0 },
    { ...schoolInput, maxUses: 2147483648 },
    { ...schoolInput, expiresAt: "not-a-date" },
    { type: "SCHOOL" },
    { ...schoolInput, coachId: "coach-1" },
    { type: "SCHOOL_COACH", schoolId: "school-1" },
    { type: "COACH", coachId: "coach-1", schoolId: "school-1" },
  ])("rejects invalid or injected creation fields before writing: %j", async (input) => {
    const { useCase, db } = setup();
    await expect(useCase.execute("actor-1", input)).rejects.toBeInstanceOf(ZodError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(["2026-09-14T11:59:59Z", now])("rejects already expired or immediately expiring links", async (expiresAt) => {
    const { useCase, db } = setup();
    await expect(useCase.execute("actor-1", { ...schoolInput, expiresAt }))
      .rejects.toMatchObject({ code: "INVITATION_INVALID_EXPIRATION", status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("does not grant school management from ownership or global roles without local membership", async () => {
    const { useCase, tx } = setup();
    tx.schoolMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("actor-1", schoolInput)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.invitationLink.create).not.toHaveBeenCalled();
  });

  it("does not allow local COACH to create school invitations", async () => {
    const { useCase, tx } = setup();
    tx.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member-1", role: "COACH" }]);
    await expect(useCase.execute("actor-1", schoolInput)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.invitationLink.create).not.toHaveBeenCalled();
  });

  it("rejects another coach's independent invitation", async () => {
    const { useCase, tx } = setup();
    tx.coachProfile.findUnique.mockResolvedValue({ id: "coach-1", userId: "someone-else", status: "ACTIVE" });
    await expect(useCase.execute("actor-1", { type: "COACH", coachId: "coach-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.invitationLink.create).not.toHaveBeenCalled();
  });

  it("requires an active coach-school relationship for SCHOOL_COACH", async () => {
    const { useCase, tx } = setup();
    tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("actor-1", { type: "SCHOOL_COACH", schoolId: "school-1", coachId: "coach-1" }))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 409 });
    expect(tx.invitationLink.create).not.toHaveBeenCalled();
  });

  it.each([null, { id: "school-1", status: "INACTIVE" }])("rejects missing/inactive schools", async (school) => {
    const { useCase, tx } = setup();
    tx.school.findUnique.mockResolvedValue(school);
    await expect(useCase.execute("actor-1", schoolInput))
      .rejects.toMatchObject({ code: school ? "SCHOOL_INACTIVE" : "SCHOOL_NOT_FOUND", status: school ? 409 : 404 });
    expect(tx.invitationLink.create).not.toHaveBeenCalled();
  });

  it.each([null, { id: "coach-1", userId: "actor-1", status: "INACTIVE" }])("rejects missing/inactive coaches", async (coach) => {
    const { useCase, tx } = setup();
    tx.coachProfile.findUnique.mockResolvedValue(coach);
    await expect(useCase.execute("actor-1", { type: "COACH", coachId: "coach-1" }))
      .rejects.toMatchObject({ code: coach ? "COACH_INACTIVE" : "COACH_PROFILE_NOT_FOUND", status: coach ? 409 : 404 });
    expect(tx.invitationLink.create).not.toHaveBeenCalled();
  });

  it.each(["P2002", "P2003", "P2034"])("maps %s to stable creation conflict", async (code) => {
    const { useCase, tx } = setup();
    tx.invitationLink.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("internal", { code, clientVersion: "test" }));
    await expect(useCase.execute("actor-1", schoolInput)).rejects.toMatchObject({ code: "INVITATION_CREATE_CONFLICT", status: 409 });
  });

  it("propagates unexpected persistence failure without returning the token", async () => {
    const { useCase, tx } = setup();
    const failure = new Error("Database unavailable");
    tx.invitationLink.create.mockRejectedValue(failure);
    await expect(useCase.execute("actor-1", schoolInput)).rejects.toBe(failure);
  });
});
