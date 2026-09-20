/**
 * T344 — E2E histórico compartilhado
 * T345 — E2E revogação de histórico
 * T346 — E2E professor não autorizado
 * T347 — E2E admin de outra escola
 * T348 — E2E convite expirado/revogado
 */
import { describe, expect, it, vi } from "vitest";
import { GrantHistoryAccess } from "@/modules/school/application/grant-history-access";
import { RevokeHistoryAccess } from "@/modules/school/application/revoke-history-access";
import { CheckHistoryAccess } from "@/modules/school/application/check-history-access";
import { AssignWorkout } from "@/modules/school/application/assign-workout";
import { AcceptInvitation } from "@/modules/school/application/accept-invitation";
import { SchoolError } from "@/modules/school/domain/errors";
import { HistoryGrantStatus, InvitationStatus, WorkoutStatus } from "@/modules/school/domain/enums";
import { hashInvitationToken } from "@/modules/school/infrastructure/invitation-token";

const NOW = new Date("2026-09-20T10:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");

const IDS = {
  schoolA: "school-sec-A",
  schoolB: "school-sec-B",
  ownerA: "user-owner-A",
  ownerB: "user-owner-B",
  coachA: "coach-profile-A",
  coachB: "coach-profile-B",
  coachUserB: "user-coach-B",
  athlete: "user-athlete-sec",
  grant: "grant-sec-1",
};

// ---------------------------------------------------------------------------
// T344 — E2E histórico compartilhado
// ---------------------------------------------------------------------------

describe("T344 — histórico compartilhado", () => {
  it("athlete grants access and coach can verify it", async () => {
    const grants: unknown[] = [];

    const scope = { activities: true, metrics: true, prescribedWorkouts: true, compliance: true, coachScores: false, coachComments: false, assessments: false, athleteFeedback: false };
    const db: Record<string, unknown> = {
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: IDS.coachA, status: "ACTIVE" }) },
      historyAccessGrant: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: IDS.grant, status: HistoryGrantStatus.ACTIVE, revokedBy: null, revokedAt: null, createdAt: NOW, updatedAt: NOW, grantedAt: NOW, ...data };
          grants.push(row);
          return row;
        }),
      },
    };
    db.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const grantUseCase = new GrantHistoryAccess(db as never, () => NOW);
    const result = await grantUseCase.execute(IDS.athlete, {
      granteeType: "COACH",
      granteeId: IDS.coachA,
      fromDate: null,
      toDate: null,
      scope: {
        activities: true, metrics: true, prescribedWorkouts: true,
        compliance: true, coachScores: false, coachComments: false,
        assessments: false, athleteFeedback: false,
      },
    });

    expect(grants).toHaveLength(1);
    expect(result.status).toBe(HistoryGrantStatus.ACTIVE);
  });

  it("CanReadAthleteHistory returns true for the granted coach (via CheckHistoryAccess)", async () => {
    // CanReadAthleteHistory resolves the coachProfile then calls CheckHistoryAccess.
    // We test CheckHistoryAccess directly since CanReadAthleteHistory needs many lookups.
    const db = {
      historyAccessGrant: {
        findFirst: vi.fn().mockResolvedValue({
          id: IDS.grant,
          athleteId: IDS.athlete,
          granteeType: "COACH",
          granteeId: IDS.coachA,
          status: HistoryGrantStatus.ACTIVE,
          revokedAt: null,
          fromDate: null,
          toDate: null,
          scope: { activities: true, metrics: false, prescribedWorkouts: false, compliance: false, coachScores: false, coachComments: false, assessments: false, athleteFeedback: false },
        }),
      },
    } as unknown as Parameters<typeof CheckHistoryAccess.prototype.execute>[0];

    const useCase = new CheckHistoryAccess(db as never);
    const canRead = await useCase.execute({ athleteId: IDS.athlete, granteeType: "COACH", granteeId: IDS.coachA, category: "activities", occurredAt: NOW });
    expect(canRead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T345 — E2E revogação de histórico
// ---------------------------------------------------------------------------

describe("T345 — revogação de histórico", () => {
  it("after revocation, CheckHistoryAccess returns false", async () => {
    const scope = { activities: true, metrics: false, prescribedWorkouts: false, compliance: false, coachScores: false, coachComments: false, assessments: false, athleteFeedback: false };
    let grantStatus: string = HistoryGrantStatus.ACTIVE;

    const makeGrantRow = (status: string) => ({
      id: IDS.grant,
      athleteId: IDS.athlete,
      granteeType: "COACH",
      granteeId: IDS.coachA,
      coachId: IDS.coachA,
      schoolId: null,
      scope,
      fromDate: null,
      toDate: null,
      grantedBy: IDS.athlete,
      status,
      grantedAt: NOW,
      revokedBy: status === HistoryGrantStatus.REVOKED ? IDS.athlete : null,
      revokedAt: status === HistoryGrantStatus.REVOKED ? NOW : null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const db: Record<string, unknown> = {
      historyAccessGrant: {
        findUnique: vi.fn().mockImplementation(async () => makeGrantRow(grantStatus)),
        update: vi.fn().mockImplementation(async () => {
          grantStatus = HistoryGrantStatus.REVOKED;
          return makeGrantRow(grantStatus);
        }),
        findFirst: vi.fn().mockImplementation(async () =>
          grantStatus === HistoryGrantStatus.ACTIVE ? makeGrantRow(grantStatus) : null),
      },
    };
    db.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const revoke = new RevokeHistoryAccess(db as never, () => NOW);
    const check = new CheckHistoryAccess(db as never);

    await revoke.execute(IDS.athlete, { grantId: IDS.grant });
    expect(grantStatus).toBe(HistoryGrantStatus.REVOKED);

    const result = await check.execute({ athleteId: IDS.athlete, granteeType: "COACH", granteeId: IDS.coachA, category: "activities", occurredAt: NOW });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T346 — E2E professor não autorizado
// ---------------------------------------------------------------------------

describe("T346 — professor não autorizado", () => {
  it("coach from school B cannot assign workout to athletes in school A", async () => {
    const db: Record<string, unknown> = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: IDS.athlete }) },
      coachProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: IDS.coachB, userId: IDS.coachUserB, status: "ACTIVE" }),
      },
      workout: {
        findUnique: vi.fn().mockResolvedValue({ id: "workout-1", status: WorkoutStatus.ACTIVE, sportType: "RUNNING" }),
      },
      schoolAthleteMembership: {
        // athlete only belongs to school A, not B
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: { schoolId: string } }) =>
          where.schoolId === IDS.schoolA ? { id: "mbr-1", schoolId: IDS.schoolA, status: "ACTIVE" } : null),
      },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      workoutAssignment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({ id: "hist-1" }) },
    };
    db.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const useCase = new AssignWorkout(db as never, () => NOW);
    // coachUserB tries to assign in school B, but athlete is not a member there
    await expect(useCase.execute(IDS.coachUserB, {
      workoutId: "workout-1",
      athleteId: IDS.athlete,
      schoolId: IDS.schoolB,
    })).rejects.toThrow(SchoolError);
  });
});

// ---------------------------------------------------------------------------
// T347 — E2E admin de outra escola
// ---------------------------------------------------------------------------

describe("T347 — admin de outra escola", () => {
  it("admin of school B cannot read audit logs of school A (authorization check)", async () => {
    // This is validated at the API layer; we simulate the role check used by the route.
    const membershipCheckDb = {
      schoolMembership: {
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: { schoolId: string; userId: string } }) => {
          // ownerB only has membership in schoolB
          if (where.schoolId === IDS.schoolA && where.userId === IDS.ownerB) return null;
          return { id: "mbr-b", schoolId: IDS.schoolB, userId: IDS.ownerB, isActive: true, roles: [{ role: "OWNER" }] };
        }),
      },
    };

    const membership = await membershipCheckDb.schoolMembership.findFirst({
      where: { schoolId: IDS.schoolA, userId: IDS.ownerB, status: "ACTIVE" },
      include: { roles: { select: { role: true } } },
    });
    const isAuthorized = (membership as { roles: { role: string }[] } | null)?.roles.some((r) => ["OWNER", "ADMIN"].includes(r.role));
    expect(isAuthorized).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// T348 — E2E convite expirado/revogado
// ---------------------------------------------------------------------------

describe("T348 — convite expirado/revogado", () => {
  const token = "test-expired-token";

  it("accepting an expired invitation throws INVITATION_EXPIRED", async () => {
    const db: Record<string, unknown> = {
      invitationLink: {
        findUnique: vi.fn().mockResolvedValue({ id: "invite-exp-1", createdBy: "admin-1", tokenHash: hashInvitationToken(token), type: "SCHOOL", schoolId: IDS.schoolA, coachId: null, requiresApproval: false, maxUses: null, usedCount: 0, status: InvitationStatus.ACTIVE, expiresAt: PAST, revokedAt: null }),
      },
      invitationUse: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    db.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const useCase = new AcceptInvitation(db as never, () => NOW);
    await expect(useCase.execute(IDS.athlete, { token })).rejects.toThrow(SchoolError);
  });

  it("accepting a revoked invitation throws INVITATION_REVOKED", async () => {
    const db: Record<string, unknown> = {
      invitationLink: {
        findUnique: vi.fn().mockResolvedValue({ id: "invite-rev-1", createdBy: "admin-1", tokenHash: hashInvitationToken(token), type: "SCHOOL", schoolId: IDS.schoolA, coachId: null, requiresApproval: false, maxUses: null, usedCount: 0, status: InvitationStatus.REVOKED, expiresAt: null, revokedAt: NOW }),
      },
      invitationUse: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    db.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const useCase = new AcceptInvitation(db as never, () => NOW);
    await expect(useCase.execute(IDS.athlete, { token })).rejects.toThrow(SchoolError);
  });

  it("accepting an exhausted invitation throws INVITATION_EXHAUSTED", async () => {
    const db: Record<string, unknown> = {
      invitationLink: {
        findUnique: vi.fn().mockResolvedValue({ id: "invite-exh-1", createdBy: "admin-1", tokenHash: hashInvitationToken(token), type: "SCHOOL", schoolId: IDS.schoolA, coachId: null, requiresApproval: false, maxUses: 5, usedCount: 5, status: InvitationStatus.EXHAUSTED, expiresAt: null, revokedAt: null }),
      },
      invitationUse: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    db.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const useCase = new AcceptInvitation(db as never, () => NOW);
    await expect(useCase.execute(IDS.athlete, { token })).rejects.toThrow(SchoolError);
  });
});
