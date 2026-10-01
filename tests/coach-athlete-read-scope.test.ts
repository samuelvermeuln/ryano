import { describe, expect, it, vi } from "vitest";
import { GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";
import { GetCoachAthleteWorkouts } from "@/modules/school/application/get-coach-athlete-workouts";

/**
 * SAM-11 — how far back the coach's athlete screens may read.
 *
 * Prescriptions created before the athlete's current membership period belong to
 * a previous stay and need the athlete's own consent (ADR-005). What is under test
 * is that the scope is applied to the query — not filtered out afterwards — and
 * that the screens are told what was left out, because a shorter history that
 * looks complete is worse than an explicit gap.
 */
const NOW = new Date("2026-09-29T15:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "ACTIVE", timezone: "America/Sao_Paulo" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-membership" }) },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: "ana@x.com", image: null }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          args.where.isPrimary === true
            ? { coachId: "coach", coach: { displayName: null, user: { name: "Carlos" } } }
            : { id: "own-assignment" },
        )),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    workoutAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    workoutExecution: { findMany: vi.fn().mockResolvedValue([]) },
    // SAM-20 — the analysis also reads imported activities and the sheet's heart rates.
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    athleteTechnicalSheet: { findUnique: vi.fn().mockResolvedValue(null) },
    workoutCompliance: {
      aggregate: vi.fn().mockResolvedValue({ _avg: { overallScore: null }, _count: { overallScore: 0 } }),
    },
    ...overrides,
  };
}

/** Merges a Prisma `where` with its `AND` branches into one flat object. */
function flattenWhere(where: Record<string, unknown>): Record<string, unknown> {
  const { AND, ...rest } = where;
  const branches = Array.isArray(AND) ? AND : AND ? [AND] : [];
  return branches.reduce<Record<string, unknown>>(
    (merged, branch) => ({ ...merged, ...flattenWhere(branch as Record<string, unknown>) }),
    rest,
  );
}

describe("GetCoachAthleteWorkouts — scope of the prescription list", () => {
  it("asks the database only for the current membership period", async () => {
    const db = makeDb();

    await new GetCoachAthleteWorkouts(db as never, () => NOW).execute("user", "school", "athlete", {});

    // The period bound is part of the query, so a row from an earlier stay can
    // never reach the result and be filtered out by mistake later. Flattened
    // because the use case composes its filter with an `AND` array.
    for (const call of db.workoutAssignment.findMany.mock.calls) {
      const where = flattenWhere(call[0].where);
      expect(where).toMatchObject({
        schoolId: "school",
        athleteId: "athlete",
        createdAt: { gte: PERIOD_START },
      });
    }
    expect(db.workoutAssignment.findMany).toHaveBeenCalled();
  });

  it("counts what it withheld so the screen can say the history is partial", async () => {
    const db = makeDb({
      workoutAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(7),
      },
    });

    const result = await new GetCoachAthleteWorkouts(db as never, () => NOW)
      .execute("user", "school", "athlete", {});

    expect(result.heldBack).toBe(7);
    // And the count itself looks strictly before the period start.
    expect(db.workoutAssignment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: PERIOD_START } }),
      }),
    );
  });

  it("refuses to read at all when the gate refuses", async () => {
    const db = makeDb({ schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(
      new GetCoachAthleteWorkouts(db as never, () => NOW).execute("user", "school", "athlete", {}),
    ).rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
    expect(db.workoutAssignment.findMany).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range page size instead of trusting the URL", async () => {
    const db = makeDb();

    await expect(
      new GetCoachAthleteWorkouts(db as never, () => NOW)
        .execute("user", "school", "athlete", { limit: 10_000 }),
    ).rejects.toThrow();
  });
});

describe("GetCoachAthleteAnalysis — window of the charts", () => {
  it("clamps a window that reaches past the membership start and reports it", async () => {
    const db = makeDb();

    const result = await new GetCoachAthleteAnalysis(db as never, () => NOW)
      .execute("user", "school", "athlete", { windowDays: 168 });

    // 24 weeks back from 2026-09-29 predates 2026-09-01, so the window is cut.
    expect(result.clampedToPeriod).toBe(true);
    expect(result.windowDays).toBe(168);
  });

  it("does not claim to have clamped a window that fits inside the period", async () => {
    const db = makeDb({
      schoolAthleteMembership: {
        findFirst: vi.fn().mockResolvedValue({
          startedAt: new Date("2020-01-01T00:00:00.000Z"),
          createdAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
      },
    });

    const result = await new GetCoachAthleteAnalysis(db as never, () => NOW)
      .execute("user", "school", "athlete", { windowDays: 28 });

    expect(result.clampedToPeriod).toBe(false);
  });

  it("accepts only the offered windows, so the URL cannot ask for an unbounded scan", async () => {
    const db = makeDb();
    const analysis = new GetCoachAthleteAnalysis(db as never, () => NOW);

    await expect(analysis.execute("user", "school", "athlete", { windowDays: 9999 })).rejects.toThrow();
    await expect(analysis.execute("user", "school", "athlete", { windowDays: 84 })).resolves.toBeTruthy();
  });

  it("scopes every aggregate to this school and athlete", async () => {
    const db = makeDb();

    await new GetCoachAthleteAnalysis(db as never, () => NOW)
      .execute("user", "school", "athlete", { windowDays: 28 });

    for (const call of db.workoutAssignment.findMany.mock.calls) {
      expect(flattenWhere(call[0].where)).toMatchObject({ schoolId: "school", athleteId: "athlete" });
    }
  });
});
