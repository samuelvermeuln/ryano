import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AcceptInvitation } from "@/modules/school/application/accept-invitation";
import { createInvitationLink, type InvitationLink } from "@/modules/school/domain/invitation-link";
import { hashInvitationToken } from "@/modules/school/infrastructure/invitation-token";

const now = new Date("2026-09-15T12:00:00Z");
const token = "exact-bearer-credential";

function setup(overrides: Partial<InvitationLink> = {}) {
  const invitation = { ...createInvitationLink({
    id: "invite-1", type: "SCHOOL", tokenHash: hashInvitationToken(token),
    schoolId: "school-1", coachId: null, createdBy: "manager-1", requiresApproval: false,
    expiresAt: null, maxUses: 1,
  }, now), ...overrides };
  const state = { invitation, memberships: [] as unknown[], assignments: [] as unknown[], uses: [] as Record<string, unknown>[] };
  const tx = {
    invitationLink: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
        where.tokenHash === invitation.tokenHash ? { ...state.invitation } : null),
      updateMany: vi.fn().mockImplementation(async ({ data }: { data: { status: InvitationLink["status"] } }) => {
        state.invitation.usedCount += 1;
        state.invitation.status = data.status;
        return { count: 1 };
      }),
    },
    invitationUse: {
      findFirst: vi.fn().mockImplementation(async () => state.uses[0] ?? null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const receipt = { id: data.id, invitationId: data.invitationId, result: data.result, usedAt: data.usedAt };
        state.uses.push(receipt);
        return receipt;
      }),
    },
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school-1", status: "ACTIVE" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-school-1" }) },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => { state.memberships.push(data); return data; }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => { state.assignments.push(data); return data; }),
    },
  };
  // Models commit/rollback boundaries for fault tests; real PostgreSQL concurrency is separate proof.
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await run(tx); } catch (error) { Object.assign(state, before); throw error; }
  }) };
  return { tx, db, state, useCase: new AcceptInvitation(db as unknown as PrismaClient, () => now) };
}

describe("AcceptInvitation", () => {
  it("joins an existing session user without creating another account or coach profile [T093]", async () => {
    const { useCase, tx, state } = setup({ type: "SCHOOL_COACH", coachId: "coach-1" });
    const accountWrites = { create: vi.fn(), createMany: vi.fn(), upsert: vi.fn() };
    const profileWrites = { create: vi.fn(), createMany: vi.fn(), upsert: vi.fn() };
    Object.assign(tx, { user: accountWrites });
    Object.assign(tx.coachProfile, profileWrites);
    const existingUserId = "existing-session-user";

    await expect(useCase.execute(existingUserId, { token })).resolves.toMatchObject({ result: "JOINED" });

    expect(state.memberships).toEqual([expect.objectContaining({
      athleteId: existingUserId, schoolId: "school-1", status: "ACTIVE",
    })]);
    expect(state.assignments).toEqual([expect.objectContaining({
      athleteId: existingUserId, schoolId: "school-1", coachId: "coach-1", status: "ACTIVE",
    })]);
    expect(tx.invitationUse.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: existingUserId, athleteId: existingUserId }),
    }));
    for (const write of [...Object.values(accountWrites), ...Object.values(profileWrites)]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it.each(["userId", "athleteId"])("rejects a client-supplied %s independently of other overrides [T093]", async (field) => {
    const { useCase, db, state } = setup();

    await expect(useCase.execute("existing-session-user", { token, [field]: "another-user" }))
      .rejects.toBeInstanceOf(ZodError);

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(state.memberships).toEqual([]);
    expect(state.assignments).toEqual([]);
    expect(state.uses).toEqual([]);
    expect(state.invitation.usedCount).toBe(0);
  });

  it.each(["SCHOOL", "SCHOOL_COACH", "COACH"] as const)("creates the correct %s scope and consumes the last use", async (type) => {
    const { useCase, tx, db, state } = setup({ type, schoolId: type === "COACH" ? null : "school-1", coachId: type === "SCHOOL" ? null : "coach-1" });
    const receipt = await useCase.execute("athlete-1", { token });
    expect(receipt).toMatchObject({ invitationId: "invite-1", result: "JOINED", usedAt: now });
    expect(receipt).not.toHaveProperty("tokenHash");
    expect(receipt).not.toHaveProperty("token");
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.invitationLink.findUnique).toHaveBeenCalledTimes(2);
    expect(state.invitation).toMatchObject({ usedCount: 1, status: "EXHAUSTED" });
    expect(state.memberships).toHaveLength(type === "COACH" ? 0 : 1);
    expect(state.assignments).toHaveLength(type === "SCHOOL" ? 0 : 1);
    if (type !== "COACH") expect(state.memberships[0]).toMatchObject({
      schoolId: "school-1", athleteId: "athlete-1", status: "ACTIVE", startedAt: now,
      approvedBy: "manager-1", joinSource: type === "SCHOOL" ? "SCHOOL_INVITE" : "SCHOOL_COACH_INVITE",
    });
    if (type !== "SCHOOL") expect(state.assignments[0]).toMatchObject({
      schoolId: type === "COACH" ? null : "school-1", athleteId: "athlete-1",
      coachId: "coach-1", status: "ACTIVE", startedAt: now, assignedBy: "manager-1",
    });
    expect(tx.invitationUse.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "athlete-1", athleteId: "athlete-1" }) }));
  });

  it.each(["SCHOOL", "SCHOOL_COACH", "COACH"] as const)("keeps %s links pending when approval is required [T096]", async (type) => {
    const { useCase, state, tx } = setup({ type, schoolId: type === "COACH" ? null : "school-1", coachId: type === "SCHOOL" ? null : "coach-1", requiresApproval: true });
    const receipt = await useCase.execute("athlete-1", { token });
    expect(receipt).toMatchObject({ invitationId: "invite-1", result: "PENDING_APPROVAL", usedAt: now });
    expect(state.memberships).toHaveLength(type === "COACH" ? 0 : 1);
    expect(state.assignments).toHaveLength(type === "SCHOOL" ? 0 : 1);
    for (const link of [...state.memberships, ...state.assignments]) {
      expect(link).toMatchObject({ athleteId: "athlete-1", status: "PENDING", startedAt: null, endedAt: null });
    }
    if (type !== "COACH") expect(state.memberships[0]).toMatchObject({ approvedBy: null, approvedAt: null });
    if (type !== "SCHOOL") expect(state.assignments[0]).toMatchObject({ assignedBy: null });
    expect(tx.invitationUse.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      data: expect.objectContaining({
        invitationId: "invite-1", userId: "athlete-1", athleteId: "athlete-1",
        result: "PENDING_APPROVAL", usedAt: now,
      }),
    }));
    expect(state.invitation).toMatchObject({ usedCount: 1, status: "EXHAUSTED" });

    // Repeating acceptance must replay the pending receipt, never approve the links.
    await expect(useCase.execute("athlete-1", { token })).resolves.toEqual(receipt);
    expect(tx.invitationUse.create).toHaveBeenCalledTimes(1);
    expect(tx.invitationLink.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.schoolAthleteMembership.create).toHaveBeenCalledTimes(type === "COACH" ? 0 : 1);
    expect(tx.coachAthleteAssignment.create).toHaveBeenCalledTimes(type === "SCHOOL" ? 0 : 1);
    for (const link of [...state.memberships, ...state.assignments]) {
      expect(link).toMatchObject({ status: "PENDING", startedAt: null });
    }
  });

  it("replays a committed receipt after exhaustion or revocation without recreating closed memberships", async () => {
    const { useCase, tx, state } = setup();
    const first = await useCase.execute("athlete-1", { token });
    expect(await useCase.execute("athlete-1", { token })).toEqual(first);
    state.invitation.status = "REVOKED";
    state.invitation.revokedAt = now;
    state.memberships.length = 0;
    expect(await useCase.execute("athlete-1", { token })).toEqual(first);
    expect(state.memberships).toEqual([]);
    expect(tx.invitationLink.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.invitationUse.create).toHaveBeenCalledTimes(1);
    expect(tx.invitationUse.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      invitationId: "invite-1", userId: "athlete-1", athleteId: "athlete-1", result: { in: ["JOINED", "PENDING_APPROVAL"] },
    } }));
  });

  it.each(["", "wrong", ` ${token}`, `${token} `])("rejects non-exact credential %j", async (credential) => {
    const { useCase, tx } = setup();
    await expect(useCase.execute("athlete-1", { token: credential })).rejects.toBeDefined();
    expect(tx.invitationLink.updateMany).not.toHaveBeenCalled();
    expect(tx.schoolAthleteMembership.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "REVOKED", revokedAt: now }, "INVITATION_REVOKED"],
    [{ expiresAt: now }, "INVITATION_EXPIRED"],
    [{ status: "EXHAUSTED", usedCount: 1 }, "INVITATION_EXHAUSTED"],
    [{ usedCount: 1 }, "INVITATION_EXHAUSTED"],
  ] as const)("rechecks unavailable invitation %j inside the transaction", async (changes, code) => {
    const { useCase, tx } = setup(changes);
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code });
    expect(tx.schoolAthleteMembership.create).not.toHaveBeenCalled();
    expect(tx.invitationUse.create).not.toHaveBeenCalled();
  });

  it("rejects inactive school or departed school coach without consumption", async () => {
    const { useCase, tx, state } = setup({ type: "SCHOOL_COACH", coachId: "coach-1" });
    tx.school.findUnique.mockResolvedValueOnce({ id: "school-1", status: "INACTIVE" });
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "SCHOOL_INACTIVE" });
    tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });
    expect(state.invitation.usedCount).toBe(0);
    expect(state.memberships).toEqual([]);
  });

  it.each(["ACTIVE", "PENDING"])("does not duplicate or upgrade an existing %s school membership", async (status) => {
    const { useCase, tx } = setup();
    tx.schoolAthleteMembership.findFirst.mockResolvedValue({ id: "old-membership", status });
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT" });
    expect(tx.invitationUse.create).not.toHaveBeenCalled();
  });

  it("allows an existing active school athlete to add the invited coach without another membership", async () => {
    const { useCase, tx, state } = setup({ type: "SCHOOL_COACH", coachId: "coach-1" });
    tx.schoolAthleteMembership.findFirst.mockResolvedValue({ id: "active-membership", status: "ACTIVE" });
    await useCase.execute("athlete-1", { token });
    expect(state.memberships).toEqual([]);
    expect(state.assignments).toHaveLength(1);
  });

  it("rolls back a new school membership if a primary coach already exists", async () => {
    const { useCase, tx, state } = setup({ type: "SCHOOL_COACH", coachId: "coach-1" });
    tx.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "other-primary" });
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT" });
    expect(state.memberships).toEqual([]);
    expect(state.invitation.usedCount).toBe(0);
  });

  it("keeps independent coach duplicate checks pair-scoped", async () => {
    const { useCase, tx } = setup({ type: "COACH", schoolId: null, coachId: "coach-1" });
    tx.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "existing" });
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT" });
    expect(tx.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
      where: { athleteId: "athlete-1", schoolId: null, coachId: "coach-1", status: { in: ["PENDING", "ACTIVE"] }, endedAt: null }, select: { id: true },
    });
  });

  it("rolls back all links when counter compare-and-set loses a race", async () => {
    const { useCase, tx, state } = setup({ type: "SCHOOL_COACH", coachId: "coach-1" });
    tx.invitationLink.updateMany.mockResolvedValue({ count: 0 });
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "INVITATION_ACCEPT_CONFLICT" });
    expect(state.memberships).toEqual([]);
    expect(state.assignments).toEqual([]);
    expect(state.uses).toEqual([]);
  });

  it("rolls back the counter and relationships when audit insertion fails", async () => {
    const { useCase, tx, state } = setup();
    const error = new Error("write failed");
    tx.invitationUse.create.mockRejectedValue(error);
    await expect(useCase.execute("athlete-1", { token })).rejects.toBe(error);
    expect(state.invitation).toMatchObject({ usedCount: 0, status: "ACTIVE" });
    expect(state.memberships).toEqual([]);
  });

  it.each(["P2002", "P2003", "P2025", "P2034"])("maps %s to a retryable conflict", async (code) => {
    const { useCase, tx } = setup();
    tx.invitationLink.updateMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("internal", { code, clientVersion: "test" }));
    await expect(useCase.execute("athlete-1", { token })).rejects.toMatchObject({ code: "INVITATION_ACCEPT_CONFLICT", status: 409 });
  });

  it.each([null, "", " athlete-1"])("requires a session actor %j", async (actor) => {
    const { useCase, db } = setup();
    await expect(useCase.execute(actor, { token })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects impersonation and approval overrides", async () => {
    const { useCase, db } = setup();
    await expect(useCase.execute("athlete-1", { token, athleteId: "victim", requiresApproval: false })).rejects.toBeInstanceOf(ZodError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("leaves unlimited invitations active", async () => {
    const { useCase, state, tx } = setup({ maxUses: null });
    await useCase.execute("athlete-1", { token });
    expect(state.invitation).toMatchObject({ usedCount: 1, status: "ACTIVE" });
    expect(tx.invitationLink.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "invite-1", status: "ACTIVE", revokedAt: null, usedCount: 0,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    } }));
  });

  it.each([0, 1])("enforces maxUses=2 after accepting from usedCount=%s [T095]", async (usedCount) => {
    const { useCase, tx, state } = setup({ maxUses: 2, usedCount });
    await expect(useCase.execute("athlete-1", { token })).resolves.toMatchObject({ result: "JOINED" });
    expect(state.invitation).toMatchObject({
      usedCount: usedCount + 1,
      status: usedCount === 0 ? "ACTIVE" : "EXHAUSTED",
    });

    if (usedCount === 1) {
      // A different actor has no committed receipt to replay after the final use.
      tx.invitationUse.findFirst.mockResolvedValue(null);
      await expect(useCase.execute("athlete-2", { token }))
        .rejects.toMatchObject({ code: "INVITATION_EXHAUSTED" });
      expect(state.invitation.usedCount).toBe(2);
      expect(state.memberships).toHaveLength(1);
      expect(state.uses).toHaveLength(1);
      expect(tx.invitationLink.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.schoolAthleteMembership.create).toHaveBeenCalledTimes(1);
    }
  });
});
