import { describe, expect, it, vi } from "vitest";
import { GetAthleteTechnicalSheet } from "@/modules/school/application/get-athlete-technical-sheet";
import { GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";
import { GetCoachAthleteOverview } from "@/modules/school/application/get-coach-athlete-overview";
import { GetCoachAthleteWorkoutDetail } from "@/modules/school/application/get-coach-athlete-workout-detail";
import { GetCoachAthleteWorkouts } from "@/modules/school/application/get-coach-athlete-workouts";
import { CreateCoachEvaluation } from "@/modules/school/application/manage-evaluation";
import { PrescribeWorkoutToAthlete } from "@/modules/school/application/prescribe-workout-to-athlete";
import { SaveAthleteTechnicalSheet } from "@/modules/school/application/save-athlete-technical-sheet";

/**
 * SAM-30 — the coach's athlete screens and writes in the INDEPENDENT scope.
 *
 * The invariant every read below is held to: the prescription filter carries
 * `coachId` next to `schoolId: null`. A bare `{ schoolId: null }` would also
 * return marketplace-licence sessions, self-logged sessions and other
 * independent coaches' prescriptions. Writes store `schoolId: null` with the
 * coach, skip the school audit log (there is none) and key the technical sheet
 * by (coachId, athleteId).
 */
const NOW = new Date("2026-10-01T15:00:00.000Z");
const LINK_START = new Date("2026-09-20T12:00:00.000Z");
const INDEPENDENT = { kind: "independent" } as const;

/** Merges a Prisma `where` with its `AND` branches into one flat object. */
function flattenWhere(where: Record<string, unknown>): Record<string, unknown> {
  const { AND, ...rest } = where;
  const branches = Array.isArray(AND) ? AND : AND ? [AND] : [];
  return branches.reduce<Record<string, unknown>>(
    (merged, branch) => ({ ...merged, ...flattenWhere(branch as Record<string, unknown>) }),
    rest,
  );
}

/** The gate's independent branch satisfied, plus every delegate the reads touch. */
function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({
        id: "coach", status: "ACTIVE", displayName: "Prof. Carlos", acceptsIndependentAthletes: true,
        sportTypes: ["swim"], user: { name: "Carlos" },
      }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockResolvedValue({ id: "link", startedAt: LINK_START, createdAt: LINK_START }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Samuel", email: "s@x.com", image: null }) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
    workoutAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    workoutAssignmentHistory: { count: vi.fn().mockResolvedValue(0) },
    workoutExecution: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    activity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    workoutChangeRequest: { count: vi.fn().mockResolvedValue(99), findMany: vi.fn().mockResolvedValue([]) },
    athleteTechnicalSheet: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
    workoutCompliance: {
      aggregate: vi.fn().mockResolvedValue({ _avg: { overallScore: null }, _count: { _all: 0 } }),
    },
    school: { findUnique: vi.fn().mockRejectedValue(new Error("school table touched")) },
    ...overrides,
  };
}

describe("independent reads — the prescription scope always names the coach", () => {
  it("GetCoachAthleteWorkouts filters by { schoolId: null, coachId } and the link's start", async () => {
    const db = makeDb();

    const result = await new GetCoachAthleteWorkouts(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", {});

    expect(db.workoutAssignment.findMany).toHaveBeenCalled();
    for (const call of [...db.workoutAssignment.findMany.mock.calls, ...db.workoutAssignment.count.mock.calls]) {
      expect(flattenWhere(call[0].where)).toMatchObject({ schoolId: null, coachId: "coach", athleteId: "athlete" });
    }
    expect(result.context.schoolId).toBeNull();
  });

  it("GetCoachAthleteAnalysis scopes aggregates and sessions the same way, and reads the sheet by coach", async () => {
    const db = makeDb();

    await new GetCoachAthleteAnalysis(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", { windowDays: 28 });

    for (const call of db.workoutAssignment.count.mock.calls) {
      expect(flattenWhere(call[0].where)).toMatchObject({ schoolId: null, coachId: "coach" });
    }
    // SAM-33 — the scoped branch names the coach; the other branch is the athlete's own UNPLANNED sessions.
    expect(db.workoutExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assignment: { OR: [
        expect.objectContaining({ schoolId: null, coachId: "coach" }),
        { status: "UNPLANNED", schoolId: null, coachId: null },
      ] } }),
    }));
    expect(db.athleteTechnicalSheet.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: null, coachId: "coach", athleteId: "athlete" },
    }));
    expect(db.athleteTechnicalSheet.findUnique).not.toHaveBeenCalled();
  });

  it("GetCoachAthleteOverview never asks for change requests outside a school", async () => {
    const db = makeDb();

    const result = await new GetCoachAthleteOverview(db as never, () => NOW).execute("user", INDEPENDENT, "athlete");

    // The mock would answer 99; the use case must not even ask.
    expect(db.workoutChangeRequest.count).not.toHaveBeenCalled();
    expect(result.openChangeRequests).toBe(0);
    for (const call of db.workoutAssignment.count.mock.calls) {
      expect(flattenWhere(call[0].where)).toMatchObject({ schoolId: null, coachId: "coach" });
    }
  });

  it("GetCoachAthleteWorkoutDetail refuses another independent coach's prescription for the same athlete", async () => {
    const db = makeDb({
      workoutAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue({
          id: "assignment", athleteId: "athlete", schoolId: null, coachId: "other-coach",
          createdAt: NOW, executions: [], workout: null, changeRequests: [], history: [], comments: [],
        }),
      },
    });

    await expect(
      new GetCoachAthleteWorkoutDetail(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", "assignment"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("GetAthleteTechnicalSheet offers the independent coach's own modalities first", async () => {
    const db = makeDb();

    const view = await new GetAthleteTechnicalSheet(db as never, () => NOW).execute("user", INDEPENDENT, "athlete");

    expect(view.schoolSportTypes).toEqual(["swim"]);
    expect(db.school.findUnique).not.toHaveBeenCalled();
  });
});

describe("SaveAthleteTechnicalSheet — independent", () => {
  function makeSaveDb(options: { existing?: boolean } = {}) {
    const tx = {
      athleteTechnicalSheet: {
        findUnique: vi.fn().mockRejectedValue(new Error("compound unique used outside a school")),
        findFirst: vi.fn().mockResolvedValue(options.existing
          ? { id: "existing-sheet", maxHeartRate: 180, thresholdHeartRate: null, restingHeartRate: null, thresholdPaceSecPerKm: null, ftpWatts: null, cssSecPer100m: null, heartRateZoneMethod: null }
          : null),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "new-sheet", ...data })),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "existing-sheet", ...data })),
        upsert: vi.fn().mockRejectedValue(new Error("upsert used outside a school")),
      },
      athleteTechnicalSheetRevision: { create: vi.fn().mockResolvedValue({}) },
      schoolAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = makeDb({ $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)) });
    return { db, tx };
  }

  it("creates the sheet keyed by (coachId, athleteId) with no school, and skips the school audit", async () => {
    const { db, tx } = makeSaveDb();

    await new SaveAthleteTechnicalSheet(db as never, () => NOW)
      .execute("user", INDEPENDENT, "athlete", { maxHeartRate: 190, sportTypes: ["run"] });

    expect(tx.athleteTechnicalSheet.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: null, coachId: "coach", athleteId: "athlete" },
    }));
    expect(tx.athleteTechnicalSheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ schoolId: null, coachId: "coach", athleteId: "athlete", maxHeartRate: 190 }),
    }));
    // SAM-18 — the revision is the trail here; the revision row has no school.
    expect(tx.athleteTechnicalSheetRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ schoolId: null, athleteId: "athlete" }),
    }));
    expect(tx.schoolAuditLog.create).not.toHaveBeenCalled();
  });

  it("updates the existing independent sheet in place instead of creating a second one", async () => {
    const { db, tx } = makeSaveDb({ existing: true });

    await new SaveAthleteTechnicalSheet(db as never, () => NOW)
      .execute("user", INDEPENDENT, "athlete", { maxHeartRate: 185 });

    expect(tx.athleteTechnicalSheet.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "existing-sheet" } }));
    expect(tx.athleteTechnicalSheet.create).not.toHaveBeenCalled();
  });
});

describe("PrescribeWorkoutToAthlete — independent", () => {
  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      title: "Técnica de nado",
      sportType: "swim",
      scheduledAt: "2026-10-02T09:00:00.000Z",
      blocks: [{ blockType: "WARMUP", durationS: 600 }],
      ...overrides,
    };
  }

  function makePrescribeDb(options: { linkStillActive?: boolean } = {}) {
    const createdAssignments: Array<Record<string, unknown>> = [];
    const tx = {
      coachSchoolMembership: { findFirst: vi.fn().mockRejectedValue(new Error("school membership checked outside a school")) },
      coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue(options.linkStillActive === false ? null : { id: "link" }) },
      team: { findFirst: vi.fn().mockResolvedValue({ id: "team" }) },
      workout: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data })) },
      workoutBlock: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data, targetPayload: null, restPayload: null })) },
      workoutAssignment: {
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          createdAssignments.push(data);
          return Promise.resolve({ ...data });
        }),
      },
      workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
      schoolAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = makeDb({ $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)) });
    return { db, tx, createdAssignments };
  }

  it("stores the prescription with no school and this coach, without a school audit row", async () => {
    const { db, tx, createdAssignments } = makePrescribeDb();

    await new PrescribeWorkoutToAthlete(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", validInput());

    expect(createdAssignments[0]).toMatchObject({ athleteId: "athlete", schoolId: null, coachId: "coach", status: "SCHEDULED" });
    expect(tx.workout.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authorCoachId: "coach", originSchoolId: null }),
    }));
    expect(tx.schoolAuditLog.create).not.toHaveBeenCalled();
    expect(tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it("refuses when the independent link ended between the check and the write", async () => {
    const { db, createdAssignments } = makePrescribeDb({ linkStillActive: false });

    await expect(new PrescribeWorkoutToAthlete(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", validInput()))
      .rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", status: 404 });
    expect(createdAssignments).toHaveLength(0);
  });

  it("has no teams to assign to: a teamId is refused as not found", async () => {
    const { db, tx } = makePrescribeDb();

    await expect(new PrescribeWorkoutToAthlete(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", validInput({ teamId: "team" })))
      .rejects.toMatchObject({ code: "TEAM_NOT_FOUND", status: 404 });
    expect(tx.team.findFirst).not.toHaveBeenCalled();
  });
});

describe("CreateCoachEvaluation — independent (no schoolId)", () => {
  function makeEvaluationDb(options: { assignment?: { schoolId: string | null; coachId: string | null }; link?: boolean } = {}) {
    const tx = {
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockRejectedValue(new Error("school membership checked without a school")) },
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue({
          id: "exec", workoutAssignmentId: "assignment", athleteId: "athlete", matchStatus: "CONFIRMED",
          assignment: options.assignment ?? { schoolId: null, coachId: "coach" },
        }),
      },
      coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue(options.link === false ? null : { id: "link" }) },
      coachEvaluation: {
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "eval", ...data })),
      },
      workoutAssignmentComment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      userNotification: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = { $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)) };
    return { db, tx };
  }

  it("evaluates the coach's own independent prescription and links the athlete to /app/treinos", async () => {
    const { db, tx } = makeEvaluationDb();

    const saved = await new CreateCoachEvaluation(db as never, () => NOW)
      .execute("user", { workoutExecutionId: "exec", overallScore: 9 });

    expect(saved).toMatchObject({ schoolId: null, coachId: "coach", overallScore: 90 });
    expect(tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.userNotification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ href: "/app/treinos/assignment" }),
    }));
  });

  it("refuses an execution whose prescription belongs to a school or to another coach", async () => {
    const inSchool = makeEvaluationDb({ assignment: { schoolId: "school", coachId: "coach" } });
    await expect(new CreateCoachEvaluation(inSchool.db as never, () => NOW).execute("user", { workoutExecutionId: "exec", overallScore: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    const otherCoach = makeEvaluationDb({ assignment: { schoolId: null, coachId: "other" } });
    await expect(new CreateCoachEvaluation(otherCoach.db as never, () => NOW).execute("user", { workoutExecutionId: "exec", overallScore: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("refuses once the independent link is no longer active", async () => {
    const { db, tx } = makeEvaluationDb({ link: false });

    await expect(new CreateCoachEvaluation(db as never, () => NOW).execute("user", { workoutExecutionId: "exec", overallScore: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.coachEvaluation.create).not.toHaveBeenCalled();
  });
});
