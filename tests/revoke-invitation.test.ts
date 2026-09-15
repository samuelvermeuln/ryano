import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { RevokeInvitation } from "@/modules/school/application/revoke-invitation";

const now = new Date("2026-09-15T12:00:00Z");
const input = { invitationId: "invite-1" };
function setup() {
  const invitation = {
    id: "invite-1", type: "SCHOOL", schoolId: "school-1" as string | null, coachId: null as string | null,
    createdBy: "former-manager", status: "ACTIVE", revokedAt: null as Date | null,
    usedCount: 2, maxUses: 5, requiresApproval: true, expiresAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"),
  };
  const tx = {
    invitationLink: {
      findUnique: vi.fn().mockImplementation(async (_args: { where: { id: string }; select: Record<string, boolean> }) => ({ ...invitation })),
      update: vi.fn().mockImplementation(async ({ data }: {
        data: Partial<typeof invitation>; select: Record<string, boolean>; where: unknown;
      }) => Object.assign(invitation, data)),
    },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue({
      id: "member-1", schoolId: "school-1", userId: "actor-1", status: "ACTIVE", endedAt: null,
    }) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "member-1", role: "ADMIN" }]) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "actor-1" }) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { invitation, tx, db, useCase: new RevokeInvitation(db as unknown as PrismaClient, () => now) };
}

describe("RevokeInvitation", () => {
  it.each(["OWNER", "ADMIN"])("allows local %s to revoke and retains usage history", async (role) => {
    const { useCase, tx, db } = setup();
    tx.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member-1", role }]);
    const result = await useCase.execute("actor-1", input);
    expect(result).toMatchObject({ status: "REVOKED", revokedAt: now, updatedAt: now, usedCount: 2, createdBy: "former-manager" });
    expect(tx.invitationLink.update).toHaveBeenCalledWith({
      where: { id: "invite-1", status: "ACTIVE", updatedAt: new Date("2026-09-01T00:00:00Z") },
      data: { status: "REVOKED", revokedAt: now, updatedAt: now }, select: expect.any(Object),
    });
    expect(tx.invitationLink.findUnique.mock.calls[0][0].select).not.toHaveProperty("tokenHash");
    expect(tx.invitationLink.update.mock.calls[0][0].select).not.toHaveProperty("tokenHash");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("tokenHash");
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("is idempotent and preserves the first revocation time", async () => {
    const { useCase, tx } = setup();
    const first = await useCase.execute("actor-1", input);
    expect(await useCase.execute("actor-1", input)).toEqual(first);
    expect(tx.invitationLink.update).toHaveBeenCalledTimes(1);
  });

  it.each(["EXPIRED", "EXHAUSTED"])("can revoke a %s link without resetting its counters", async (status) => {
    const { useCase, invitation } = setup();
    invitation.status = status;
    expect(await useCase.execute("actor-1", input)).toMatchObject({ status: "REVOKED", usedCount: 2 });
  });

  it("allows the coach owner to revoke an independent invitation", async () => {
    const { useCase, invitation, tx } = setup();
    Object.assign(invitation, { type: "COACH", schoolId: null, coachId: "coach-1" });
    expect(await useCase.execute("actor-1", input)).toMatchObject({ status: "REVOKED" });
    expect(tx.schoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it("requires school management even when the school-coach invitation belongs to the actor's coach", async () => {
    const { useCase, invitation, tx } = setup();
    Object.assign(invitation, { type: "SCHOOL_COACH", coachId: "coach-1", createdBy: "actor-1" });
    tx.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member-1", role: "COACH" }]);
    await expect(useCase.execute("actor-1", input)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.invitationLink.update).not.toHaveBeenCalled();
  });

  it("requires current authorization even for a previously revoked link created by the actor", async () => {
    const { useCase, invitation, tx } = setup();
    Object.assign(invitation, { status: "REVOKED", revokedAt: now, createdBy: "actor-1" });
    tx.schoolMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("actor-1", input)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.invitationLink.update).not.toHaveBeenCalled();
  });

  it.each([null, { userId: "other-user" }])("rejects missing or other coach ownership", async (coach) => {
    const { useCase, invitation, tx } = setup();
    Object.assign(invitation, { type: "COACH", schoolId: null, coachId: "coach-1" });
    tx.coachProfile.findUnique.mockResolvedValue(coach);
    await expect(useCase.execute("actor-1", input)).rejects.toMatchObject({
      code: coach ? "FORBIDDEN" : "COACH_PROFILE_NOT_FOUND", status: coach ? 403 : 404,
    });
    expect(tx.invitationLink.update).not.toHaveBeenCalled();
  });

  it("returns a stable not-found error", async () => {
    const { useCase, tx } = setup();
    tx.invitationLink.findUnique.mockResolvedValue(null);
    await expect(useCase.execute("actor-1", input)).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND", status: 404 });
  });

  it.each([null, "", " actor-1"])("rejects invalid actor before opening transaction", async (actor) => {
    const { useCase, db } = setup();
    await expect(useCase.execute(actor, input)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([{ invitationId: "" }, { invitationId: " invite-1" }, { ...input, actorUserId: "victim" }, { ...input, status: "ACTIVE" }])(
    "rejects invalid or injected DTO fields", async (raw) => {
      const { useCase, db } = setup();
      await expect(useCase.execute("actor-1", raw)).rejects.toBeInstanceOf(ZodError);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["P2025", "P2034"])("retries %s and returns an already committed concurrent revocation", async (code) => {
    const { useCase, invitation, tx, db } = setup();
    tx.invitationLink.update.mockImplementationOnce(async () => {
      Object.assign(invitation, { status: "REVOKED", revokedAt: now, updatedAt: now });
      throw new Prisma.PrismaClientKnownRequestError("internal", { code, clientVersion: "test" });
    });
    expect(await useCase.execute("actor-1", input)).toMatchObject({ status: "REVOKED", revokedAt: now });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.invitationLink.update).toHaveBeenCalledTimes(1);
  });

  it("bounds contention retries and exposes a safe conflict", async () => {
    const { useCase, tx, db } = setup();
    tx.invitationLink.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("internal", { code: "P2034", clientVersion: "test" }));
    await expect(useCase.execute("actor-1", input)).rejects.toMatchObject({ code: "INVITATION_REVOKE_CONFLICT", status: 409 });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it("does not hide unexpected persistence failures", async () => {
    const { useCase, tx } = setup();
    const error = new Error("database unavailable");
    tx.invitationLink.update.mockRejectedValue(error);
    await expect(useCase.execute("actor-1", input)).rejects.toBe(error);
  });
});
