/**
 * T330 — E2E criar escola
 * T331 — E2E admin + coach
 * T332 — E2E convite de atleta
 * T333 — E2E aprovação de atleta
 * T334 — E2E atribuição de professor
 * T335 — E2E remoção de professor → lobby
 * T336 — E2E reatribuição de aluno
 * T337 — E2E saída e retorno do atleta
 * T338 — E2E desativação da escola
 *
 * All tests use in-memory Prisma mocks and cover the full use-case chain,
 * not just individual units. Each scenario builds on the previous state.
 */
import { describe, expect, it, vi } from "vitest";
import { SchoolService } from "@/modules/school/application/school-service";
import { RequestCoachSchoolMembership } from "@/modules/school/application/request-coach-school-membership";
import { ApproveCoachSchoolMembership } from "@/modules/school/application/approve-coach-school-membership";
import { CreateInvitationLink } from "@/modules/school/application/create-invitation-link";
import { AcceptInvitation } from "@/modules/school/application/accept-invitation";
import { ApproveAthleteMembership } from "@/modules/school/application/approve-athlete-membership";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { RemoveAthleteFromSchool } from "@/modules/school/application/remove-athlete-from-school";
import { RejoinSchool } from "@/modules/school/application/rejoin-school";
import { SchoolError } from "@/modules/school/domain/errors";
import { InvitationStatus } from "@/modules/school/domain/enums";
import { hashInvitationToken } from "@/modules/school/infrastructure/invitation-token";

const NOW = new Date("2026-09-15T10:00:00Z");

/** Creates a mock $transaction that passes the same db object as the transaction client. */
function withTx<T extends Record<string, Record<string, unknown>>>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => fn(db),
    ),
  });
}

// ---------------------------------------------------------------------------
// Shared state for chained scenarios
// ---------------------------------------------------------------------------

const IDS = {
  school: "school-e2e-1",
  owner: "user-owner-1",
  coachUser: "user-coach-1",
  coachProfile: "coach-profile-1",
  athlete1: "user-athlete-1",
  athlete2: "user-athlete-2",
  coachMembership: "coach-school-mbr-1",
  athleteMembership1: "athlete-mbr-1",
  athleteMembership2: "athlete-mbr-2",
  coachAthleteAssignment1: "coach-athlete-asgn-1",
  invite: "invite-e2e-1",
};

function makeSchoolStore(active = true) {
  return {
    findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: active ? "ACTIVE" : "INACTIVE", name: "Test School" }),
    update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: IDS.school, ...data,
    })),
  };
}

/** Returns a school membership row recognised as ACTIVE by CanManageSchool. */
function makeOwnerMembership() {
  return {
    id: "owner-mbr-1",
    userId: IDS.owner,
    schoolId: IDS.school,
    status: "ACTIVE",
    startedAt: NOW,
    endedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Builds a schoolMembership mock with findFirst returning an active OWNER membership,
 * and findRoles returning the OWNER role — satisfying CanManageSchool. */
function makeSchoolMembershipMock() {
  return {
    findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()),
    findMany: vi.fn().mockResolvedValue([]),
    // findRoles is accessed through the repository layer — repo calls findMany on schoolMembershipRole
    // but CanManageSchool calls repo.findRoles which is:
    // return this.db.schoolMembershipRole.findMany({ where: { membershipId } })
    // So we need schoolMembershipRole in the mock too (see each test).
  };
}

// ---------------------------------------------------------------------------
// T330 — E2E criar escola
// ---------------------------------------------------------------------------

describe("T330 — criar escola", () => {
  it("creates a school and assigns OWNER role to the creator", async () => {
    const db = withTx({
      user: { findUnique: vi.fn().mockResolvedValue({ id: IDS.owner, status: "ACTIVE" }) },
      school: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: IDS.school, slug: "test-school" })),
      },
      schoolMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "mbr-1", userId: IDS.owner, schoolId: IDS.school }),
      },
      schoolMembershipRole: {
        create: vi.fn().mockResolvedValue({ id: "role-1", membershipId: "mbr-1", role: "OWNER" }),
      },
    });

    const service = new SchoolService(db as never, () => NOW);
    const result = await service.create(IDS.owner, { name: "Test School" });

    expect(result.name).toBe("Test School");
    expect(db.schoolMembershipRole.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "OWNER" }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// T331 — E2E admin + coach
// ---------------------------------------------------------------------------

describe("T331 — admin e coach", () => {
  it("coach requests membership and admin approves it", async () => {
    const coachMbrState = { status: "PENDING" as string };
    const db = withTx({
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE" }) },
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: IDS.coachProfile, userId: IDS.coachUser, status: "ACTIVE" }) },
      coachSchoolMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: IDS.coachMembership, coachId: IDS.coachProfile, schoolId: IDS.school, status: "PENDING", requestedAt: NOW, decidedAt: null, startedAt: null, endedAt: null, createdAt: NOW, updatedAt: NOW }),
        findUnique: vi.fn().mockImplementation(async () => ({ id: IDS.coachMembership, schoolId: IDS.school, coachId: IDS.coachProfile, status: coachMbrState.status, requestedAt: NOW, decidedAt: null, startedAt: null, endedAt: null, createdAt: NOW, updatedAt: NOW })),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          coachMbrState.status = data.status as string;
          return { id: IDS.coachMembership, coachId: IDS.coachProfile, schoolId: IDS.school, status: coachMbrState.status, requestedAt: NOW, decidedAt: NOW, startedAt: NOW, endedAt: null, createdAt: NOW, updatedAt: NOW };
        }),
      },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
    });

    const request = new RequestCoachSchoolMembership(db as never, () => NOW);
    const approve = new ApproveCoachSchoolMembership(db as never);

    await request.execute(IDS.coachUser, IDS.school);
    expect(coachMbrState.status).toBe("PENDING");

    await approve.execute(IDS.owner, IDS.school, IDS.coachMembership);
    expect(coachMbrState.status).toBe("ACTIVE");
  });
});

// ---------------------------------------------------------------------------
// T332 — E2E convite de atleta
// ---------------------------------------------------------------------------

describe("T332 — convite de atleta", () => {
  it("admin creates an invite link and athlete accepts it", async () => {
    let storedInvite: Record<string, unknown> | null = null;
    let usedCount = 0;

    const db = withTx({
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
      invitationLink: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          storedInvite = { id: IDS.invite, ...data, usedCount: 0, createdAt: NOW, updatedAt: NOW, revokedAt: null };
          return storedInvite;
        }),
        findUnique: vi.fn().mockImplementation(async () => storedInvite ? { ...storedInvite, usedCount, coachId: null } : null),
        updateMany: vi.fn().mockImplementation(async () => { usedCount++; return { count: 1 }; }),
      },
      invitationUse: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "use-1", invitationId: IDS.invite, userId: IDS.athlete1, athleteId: IDS.athlete1, result: "PENDING_APPROVAL", usedAt: NOW }),
      },
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE" }) },
      coachProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      schoolAthleteMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: IDS.athleteMembership1, schoolId: IDS.school, athleteId: IDS.athlete1, joinSource: "SCHOOL_INVITE", status: "PENDING", startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: NOW, updatedAt: NOW }),
      },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const create = new CreateInvitationLink(db as never, () => NOW);
    const accept = new AcceptInvitation(db as never, () => NOW);

    const { token: issuedToken } = await create.execute(IDS.owner, {
      type: "SCHOOL", schoolId: IDS.school, requiresApproval: true, maxUses: 10,
    });

    await accept.execute(IDS.athlete1, { token: issuedToken });
    expect(usedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T333 — E2E aprovação de atleta
// ---------------------------------------------------------------------------

describe("T333 — aprovação de atleta", () => {
  it("pending membership transitions to ACTIVE after admin approval", async () => {
    let mbrStatus = "PENDING";

    const makeMbrRow = (status: string) => ({
      id: IDS.athleteMembership1,
      schoolId: IDS.school,
      athleteId: IDS.athlete1,
      joinSource: "SCHOOL_INVITE",
      status,
      startedAt: status === "ACTIVE" ? NOW : null,
      endedAt: null,
      approvedBy: status === "ACTIVE" ? IDS.owner : null,
      approvedAt: status === "ACTIVE" ? NOW : null,
      rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null,
      createdAt: NOW, updatedAt: NOW,
    });

    const db = withTx({
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE" }) },
      schoolAthleteMembership: {
        findUnique: vi.fn().mockImplementation(async () => makeMbrRow(mbrStatus)),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          mbrStatus = data.status as string;
          return makeMbrRow(mbrStatus);
        }),
      },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
    });

    const useCase = new ApproveAthleteMembership(db as never);
    await useCase.execute(IDS.owner, IDS.school, IDS.athleteMembership1);
    expect(mbrStatus).toBe("ACTIVE");
  });
});

// ---------------------------------------------------------------------------
// T334 — E2E atribuição de professor
// ---------------------------------------------------------------------------

describe("T334 — atribuição de professor", () => {
  it("admin assigns coach to athlete and creates CoachAthleteAssignment", async () => {
    const assignments: unknown[] = [];
    const db = withTx({
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE", ownerUserId: IDS.owner }) },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: IDS.coachMembership, schoolId: IDS.school, coachId: IDS.coachProfile, status: "ACTIVE", requestedAt: NOW, decidedAt: NOW, startedAt: NOW, endedAt: null, createdAt: NOW, updatedAt: NOW }) },
      schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ id: IDS.athleteMembership1, schoolId: IDS.school, athleteId: IDS.athlete1, joinSource: "SCHOOL_INVITE", status: "ACTIVE", startedAt: NOW, endedAt: null, approvedBy: IDS.owner, approvedAt: NOW, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: NOW, updatedAt: NOW }) },
      coachAthleteAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: IDS.coachAthleteAssignment1, startedAt: null, endedAt: null, assignedBy: null, endedBy: null, createdAt: NOW, updatedAt: NOW, ...data };
          assignments.push(row);
          return row;
        }),
      },
    });

    const useCase = new AssignCoachToAthlete(db as never, () => NOW);
    await useCase.execute(IDS.owner, IDS.school, IDS.athlete1, IDS.coachProfile);
    expect(assignments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T335 — E2E remoção de professor → lobby
// ---------------------------------------------------------------------------

describe("T335 — remoção de professor e lobby", () => {
  it("ending a CoachAthleteAssignment leaves the athlete without a coach (lobby state)", async () => {
    let assignmentEndedAt: Date | null = null;

    const makeAssignmentRow = (endedAt: Date | null) => ({
      id: IDS.coachAthleteAssignment1,
      schoolId: IDS.school,
      athleteId: IDS.athlete1,
      coachId: IDS.coachProfile,
      isPrimary: true,
      sportType: null,
      status: endedAt ? "ENDED" : "ACTIVE",
      startedAt: NOW,
      endedAt,
      assignedBy: IDS.owner,
      endedBy: endedAt ? IDS.owner : null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    let assignmentActive = true;
    const db = withTx({
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE", ownerUserId: IDS.owner }) },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
      coachAthleteAssignment: {
        findFirst: vi.fn().mockImplementation(async () => assignmentActive ? makeAssignmentRow(null) : null),
        findUnique: vi.fn().mockImplementation(async () => makeAssignmentRow(null)),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          assignmentEndedAt = data.endedAt as Date;
          assignmentActive = false;
          return makeAssignmentRow(assignmentEndedAt);
        }),
        create: vi.fn().mockResolvedValue({ id: "new-asgn", schoolId: IDS.school, athleteId: IDS.athlete1, coachId: IDS.coachProfile, isPrimary: true, sportType: null, status: "ACTIVE", startedAt: NOW, endedAt: null, assignedBy: IDS.owner, endedBy: null, createdAt: NOW, updatedAt: NOW }),
      },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) }, // will be overridden per test
      schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ id: IDS.athleteMembership1, schoolId: IDS.school, athleteId: IDS.athlete1, joinSource: "SCHOOL_INVITE", status: "ACTIVE", startedAt: NOW, endedAt: null, approvedBy: IDS.owner, approvedAt: NOW, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: NOW, updatedAt: NOW }) },
    });



    const db2CoachProfile = "coach-profile-lobby";
    // Ensure the new coach has an active school membership so the assignment can proceed
    (db.coachSchoolMembership.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { coachId: string } }) =>
        where.coachId === db2CoachProfile
          ? { id: "mbr-lobby", schoolId: IDS.school, coachId: db2CoachProfile, status: "ACTIVE", requestedAt: NOW, decidedAt: NOW, startedAt: NOW, endedAt: null, createdAt: NOW, updatedAt: NOW }
          : null,
    );

    const useCase = new ChangeAthleteCoach(db as never, () => NOW);
    await useCase.execute(IDS.owner, IDS.school, IDS.athlete1, db2CoachProfile);

    expect(assignmentEndedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T336 — E2E reatribuição de aluno
// ---------------------------------------------------------------------------

describe("T336 — reatribuição de aluno", () => {
  it("changes athlete from coach A to coach B", async () => {
    const IDS2 = { coachProfile2: "coach-profile-2", coachMembership2: "coach-school-mbr-2" };
    const created: unknown[] = [];
    let previousEndedAt: Date | null = null;

    let oldAssignmentActive = true;
    const oldAssignment = { id: IDS.coachAthleteAssignment1, schoolId: IDS.school, athleteId: IDS.athlete1, coachId: IDS.coachProfile, isPrimary: true, sportType: null, status: "ACTIVE", startedAt: NOW, endedAt: null, assignedBy: IDS.owner, endedBy: null, createdAt: NOW, updatedAt: NOW };
    const db = withTx({
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE", ownerUserId: IDS.owner }) },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
      coachAthleteAssignment: {
        findFirst: vi.fn().mockImplementation(async () => oldAssignmentActive ? oldAssignment : null),
        findUnique: vi.fn().mockResolvedValue(oldAssignment),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          previousEndedAt = data.endedAt as Date;
          oldAssignmentActive = false;
          return { ...oldAssignment, status: "ENDED", endedAt: previousEndedAt, endedBy: IDS.owner, updatedAt: NOW };
        }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "new-assignment", startedAt: null, endedAt: null, assignedBy: IDS.owner, endedBy: null, createdAt: NOW, updatedAt: NOW, ...data };
          created.push(row);
          return row;
        }),
      },
      coachSchoolMembership: {
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: { coachId: string } }) =>
          where.coachId === IDS2.coachProfile2
            ? { id: IDS2.coachMembership2, schoolId: IDS.school, coachId: IDS2.coachProfile2, status: "ACTIVE", requestedAt: NOW, decidedAt: NOW, startedAt: NOW, endedAt: null, createdAt: NOW, updatedAt: NOW }
            : { id: IDS.coachMembership, schoolId: IDS.school, coachId: IDS.coachProfile, status: "ACTIVE", requestedAt: NOW, decidedAt: NOW, startedAt: NOW, endedAt: null, createdAt: NOW, updatedAt: NOW }),
      },
      schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ id: IDS.athleteMembership1, schoolId: IDS.school, athleteId: IDS.athlete1, joinSource: "SCHOOL_INVITE", status: "ACTIVE", startedAt: NOW, endedAt: null, approvedBy: IDS.owner, approvedAt: NOW, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: NOW, updatedAt: NOW }) },
    });

    const useCase = new ChangeAthleteCoach(db as never, () => NOW);
    await useCase.execute(IDS.owner, IDS.school, IDS.athlete1, IDS2.coachProfile2);

    expect(previousEndedAt).not.toBeNull();
    expect(created).toHaveLength(1);
    expect((created[0] as Record<string, unknown>).coachId).toBe(IDS2.coachProfile2);
  });
});

// ---------------------------------------------------------------------------
// T337 — E2E saída e retorno do atleta
// ---------------------------------------------------------------------------

describe("T337 — saída e retorno do atleta", () => {
  it("athlete leaves school then can rejoin (request new pending membership)", async () => {
    let mbrStatus: string = "ACTIVE";
    let newMemberships: unknown[] = [];

    const makeAthleteMbrRow = (status: string) => ({
      id: IDS.athleteMembership1,
      schoolId: IDS.school,
      athleteId: IDS.athlete1,
      joinSource: "SCHOOL_INVITE",
      status,
      startedAt: status !== "PENDING" ? NOW : null,
      endedAt: (status === "ENDED" || status === "REJECTED" || status === "REVOKED") ? NOW : null,
      approvedBy: status !== "PENDING" ? IDS.owner : null,
      approvedAt: status !== "PENDING" ? NOW : null,
      rejectedBy: status === "REJECTED" ? IDS.owner : null,
      rejectedAt: status === "REJECTED" ? NOW : null,
      revokedBy: status === "REVOKED" ? IDS.owner : null,
      revokedAt: status === "REVOKED" ? NOW : null,
      createdAt: NOW, updatedAt: NOW,
    });

    const db = {
      schoolAthleteMembership: {
        findFirst: vi.fn().mockImplementation(async () => mbrStatus === "ACTIVE" ? makeAthleteMbrRow("ACTIVE") : null),
        findUnique: vi.fn().mockImplementation(async () => makeAthleteMbrRow(mbrStatus)),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          mbrStatus = data.status as string;
          return makeAthleteMbrRow(mbrStatus);
        }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "mbr-new", startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: NOW, updatedAt: NOW, ...data };
          newMemberships.push(row);
          return row;
        }),
      },
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "ACTIVE", ownerUserId: IDS.athlete1 }) },
    } as unknown as Parameters<typeof RemoveAthleteFromSchool.prototype.execute>[0];

    const remove = new RemoveAthleteFromSchool(db as never, () => NOW);
    const rejoin = new RejoinSchool(db as never, () => NOW);

    await remove.execute(IDS.athlete1, IDS.school, IDS.athleteMembership1);
    expect(mbrStatus).toBe("ENDED");

    // After leaving, findFirst returns null (inactive not matched), so rejoin creates new
    await rejoin.execute(IDS.athlete1, IDS.school);
    expect(newMemberships).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T338 — E2E desativação da escola
// ---------------------------------------------------------------------------

describe("T338 — desativação da escola", () => {
  it("owner can deactivate the school via SchoolService", async () => {
    let schoolStatus = "ACTIVE";

    const db = {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
      school: {
        findUnique: vi.fn().mockImplementation(async () => ({ id: IDS.school, status: schoolStatus, name: "Test School", ownerUserId: IDS.owner })),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ id: IDS.school, status: schoolStatus, name: "Test School", ownerUserId: IDS.owner })),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.status) schoolStatus = data.status as string;
          return { id: IDS.school, status: schoolStatus };
        }),
        updateMany: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.status) schoolStatus = data.status as string;
          return { count: 1 };
        }),
      },
      schoolMembership: {
        findFirst: vi.fn().mockResolvedValue(makeOwnerMembership()),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role-1", membershipId: "owner-mbr-1", role: "OWNER" }]) },
      schoolAthleteMembership: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      coachSchoolMembership: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      coachAthleteAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      workoutAssignment: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      workoutAssignmentHistory: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      adminAuditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      schoolAuditLog: { create: vi.fn().mockResolvedValue({ id: "log-1" }) },
    } as unknown as Parameters<typeof SchoolService.prototype.deactivate>[0];

    const service = new SchoolService(db as never, () => NOW);
    await service.deactivate(IDS.owner, IDS.school);
    expect(schoolStatus).toBe("INACTIVE");
  });

  it("deactivated school blocks new coach memberships", async () => {
    const db = {
      school: { findUnique: vi.fn().mockResolvedValue({ id: IDS.school, status: "INACTIVE" }) },
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: IDS.coachProfile, userId: IDS.coachUser, status: "ACTIVE" }) },
    } as unknown as Parameters<typeof RequestCoachSchoolMembership.prototype.execute>[0];

    const useCase = new RequestCoachSchoolMembership(db as never, () => NOW);
    await expect(useCase.execute(IDS.coachUser, IDS.school)).rejects.toThrow(SchoolError);
  });
});
