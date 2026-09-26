import { describe, expect, it, vi } from "vitest";
import { SetCoachSuspension } from "@/modules/school/application/set-coach-suspension";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { SchoolError } from "@/modules/school/domain/errors";
import { AuditAction } from "@/modules/school/infrastructure/audit-service";
import {
  createCoachSchoolMembership,
  suspendCoachSchoolMembership,
  transitionCoachSchoolMembership,
  type CoachSchoolMembership,
} from "@/modules/school/domain/coach-school-membership";
import {
  createSchoolAthleteMembership,
  transitionSchoolAthleteMembership,
} from "@/modules/school/domain/school-athlete-membership";

const prior = new Date("2026-09-20T10:00:00Z");
const now = new Date("2026-09-20T12:00:00Z");

function fixture(options: { suspended?: boolean; role?: string; schoolStatus?: string } = {}) {
  const base = transitionCoachSchoolMembership(
    createCoachSchoolMembership({ id: "coach-membership", schoolId: "school", coachId: "coach" }, prior),
    "ACTIVE",
    prior,
  );
  let row: CoachSchoolMembership = options.suspended
    ? suspendCoachSchoolMembership(base, "owner", new Date("2026-09-20T11:00:00Z"))
    : base;
  const audits: unknown[] = [];

  const tx = {
    school: { findUnique: vi.fn(async () => ({ id: "school", status: options.schoolStatus ?? "ACTIVE" })) },
    schoolMembership: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === "owner"
          ? { id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null }
          : null),
    },
    schoolMembershipRole: {
      findMany: vi.fn(async () => [{ membershipId: "manager", role: options.role ?? "OWNER" }]),
    },
    coachSchoolMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === row.id ? row : null),
      findFirst: vi.fn(async () => row),
      updateMany: vi.fn(async ({ data }: { data: Partial<CoachSchoolMembership> }) => {
        row = { ...row, ...data };
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Partial<CoachSchoolMembership> }) => {
        row = { ...row, ...data };
        return row;
      }),
    },
    schoolAthleteMembership: {
      findFirst: vi.fn(async ({ where }: { where: { athleteId: string } }) =>
        transitionSchoolAthleteMembership(
          createSchoolAthleteMembership(
            { id: "am", schoolId: "school", athleteId: where.athleteId, joinSource: "MANUAL_SEARCH" },
            prior,
          ),
          "ACTIVE",
          prior,
        )),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: unknown }) => data),
    },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: unknown }) => { audits.push(data); return data; }) },
  };

  const db = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  return {
    tx,
    db,
    audits,
    row: () => row,
    suspension: new SetCoachSuspension(db as never, () => now),
    assign: new AssignCoachToAthlete(db as never, () => now),
  };
}

describe("SetCoachSuspension", () => {
  it("suspends without ending the link, keeping athletes attached", async () => {
    const f = fixture();
    const saved = await f.suspension.execute("owner", "school", "coach-membership", { suspended: true });
    expect(saved.suspendedAt).toEqual(now);
    expect(saved.suspendedBy).toBe("owner");
    expect(saved.status).toBe("ACTIVE");
    expect(saved.endedAt).toBeNull();
  });

  it("reactivates, clearing the suspension", async () => {
    const f = fixture({ suspended: true });
    const saved = await f.suspension.execute("owner", "school", "coach-membership", { suspended: false });
    expect(saved.suspendedAt).toBeNull();
    expect(saved.suspendedBy).toBeNull();
  });

  it("records who suspended the coach and why", async () => {
    const f = fixture();
    await f.suspension.execute("owner", "school", "coach-membership", {
      suspended: true, reason: "Licença médica",
    });
    expect(f.audits).toHaveLength(1);
    expect(f.audits[0]).toMatchObject({
      schoolId: "school", actorUserId: "owner", action: AuditAction.COACH_SUSPENDED, entityId: "coach-membership",
    });
  });

  it("runs serializably so two administrators cannot interleave", async () => {
    const f = fixture();
    await f.suspension.execute("owner", "school", "coach-membership", { suspended: true });
    expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("refuses a caller who cannot manage members", async () => {
    const f = fixture({ role: "COACH" });
    await expect(f.suspension.execute("owner", "school", "coach-membership", { suspended: true }))
      .rejects.toThrow(SchoolError);
  });

  it("refuses a caller who is not a member at all", async () => {
    const f = fixture();
    await expect(f.suspension.execute("stranger", "school", "coach-membership", { suspended: true }))
      .rejects.toThrow(SchoolError);
  });

  it("rejects an anonymous caller before touching the database", async () => {
    const f = fixture();
    await expect(f.suspension.execute(null, "school", "coach-membership", { suspended: true }))
      .rejects.toMatchObject({ status: 401 });
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });

  it("hides a membership that belongs to another school behind a 404", async () => {
    const f = fixture();
    f.tx.coachSchoolMembership.findUnique.mockResolvedValueOnce({
      ...f.row(), id: "coach-membership", schoolId: "other-school",
    });
    await expect(f.suspension.execute("owner", "school", "coach-membership", { suspended: true }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("rejects unknown fields instead of silently ignoring them", async () => {
    const f = fixture();
    await expect(f.suspension.execute("owner", "school", "coach-membership", {
      suspended: true, membershipId: "other",
    })).rejects.toThrow();
  });
});

describe("a suspended coach receives no new athletes", () => {
  it("blocks a direct assignment", async () => {
    const f = fixture({ suspended: true });
    await expect(f.assign.execute("owner", "school", "athlete", "coach"))
      .rejects.toMatchObject({ status: 409 });
    expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });

  it("allows it again once reactivated", async () => {
    const f = fixture();
    await expect(f.assign.execute("owner", "school", "athlete", "coach")).resolves.toMatchObject({
      coachId: "coach", status: "ACTIVE",
    });
  });
});
