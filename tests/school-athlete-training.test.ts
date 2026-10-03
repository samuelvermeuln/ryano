import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  ATHLETE_TRAINING_FILTERS,
  GetSchoolAthleteTraining,
} from "@/modules/school/application/get-school-athlete-training";
import { SchoolError } from "@/modules/school/domain/errors";

/**
 * The school's athlete sheet reads another person's training, so what is under
 * test is the boundary: who may read it, which rows can and cannot reach the
 * result, and that "overdue" means the same thing as on the dashboard.
 */
const NOW = new Date("2026-09-29T15:00:00.000Z");
const TODAY = new Date("2026-09-29T00:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");

const managerMembership = {
  id: "membership", schoolId: "school", userId: "owner", status: "ACTIVE",
  startedAt: PERIOD_START, endedAt: null, createdAt: PERIOD_START, updatedAt: PERIOD_START,
};

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment", scheduledAt: new Date("2026-09-30T09:00:00.000Z"), status: "SCHEDULED",
    sourceLabel: null, createdAt: PERIOD_START, coachId: "coach",
    updatedAt: PERIOD_START, adaptationVersion: 0, history: [],
    coach: { displayName: "Prof. Carlos", user: { name: "Carlos" } },
    team: { name: "Turma A" },
    workout: {
      title: "Longo de domingo", description: null, sportType: "running", updatedAt: PERIOD_START,
      authorCoach: { displayName: "Prof. Carlos" },
      blocks: [{
        id: "block", blockType: "STEADY", title: null, durationS: 1800,
        distanceM: "5000.00", repetitions: null, targetPayload: null, restPayload: null,
      }],
    },
    executions: [],
    changeRequests: [],
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(managerMembership) },
    schoolMembershipRole: {
      findMany: vi.fn().mockResolvedValue([{ id: "role", membershipId: "membership", role: "OWNER" }]),
    },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: "athlete-membership", startedAt: PERIOD_START, createdAt: PERIOD_START }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: "ana@example.com", image: null }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockResolvedValue({
        coachId: "coach", coach: { displayName: "Prof. Carlos", user: { name: "Carlos" } },
      }),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([{ team: { name: "Turma A" } }]) },
    workoutAssignment: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    workoutChangeRequest: { count: vi.fn().mockResolvedValue(0) },
    // SAM-5 — cuidados da ficha técnica; sem ficha = sem notas de segurança.
    athleteTechnicalSheet: { findUnique: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

type Db = ReturnType<typeof makeDb>;

function run(db: Db, raw: unknown = {}, actor: string | null = "owner") {
  return new GetSchoolAthleteTraining(db as never, () => NOW).execute(actor, "school", "athlete", raw);
}

/** The `where` clause of the row query (as opposed to the count queries). */
function rowQuery(db: Db) {
  const [[args]] = db.workoutAssignment.findMany.mock.calls as [[{
    where: { AND: Record<string, unknown>[] };
    orderBy: unknown;
    take: number;
  }]];
  return args;
}

describe("GetSchoolAthleteTraining — authorization", () => {
  it("requires a signed-in actor and reads nothing without one", async () => {
    const db = makeDb();

    await expect(run(db, {}, null)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.workoutAssignment.findMany).not.toHaveBeenCalled();
  });

  it("refuses someone who is not an administrator before touching any training data", async () => {
    const db = makeDb({
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ id: "role", membershipId: "membership", role: "COACH" }]) },
    });

    await expect(run(db)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(db.workoutAssignment.findMany).not.toHaveBeenCalled();
    expect(db.workoutAssignment.count).not.toHaveBeenCalled();
  });

  it("treats an athlete without an active link to this school as not found", async () => {
    const db = makeDb({ schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(run(db)).rejects.toBeInstanceOf(SchoolError);
    await expect(run(db)).rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND", status: 404 });
    expect(db.schoolAthleteMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: "school", athleteId: "athlete", status: "ACTIVE", endedAt: null }),
      }),
    );
    expect(db.workoutAssignment.findMany).not.toHaveBeenCalled();
  });

  it("rejects unknown options instead of ignoring them", async () => {
    await expect(run(makeDb(), { filter: "tudo" })).rejects.toBeInstanceOf(ZodError);
    await expect(run(makeDb(), { limit: 500 })).rejects.toBeInstanceOf(ZodError);
    await expect(run(makeDb(), { schoolId: "other" })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("GetSchoolAthleteTraining — what can reach the result", () => {
  it("only reads this school's prescriptions from the current membership period, never UNPLANNED", async () => {
    const db = makeDb();
    await run(db);

    expect(rowQuery(db).where.AND[0]).toEqual({
      schoolId: "school",
      athleteId: "athlete",
      status: { not: "UNPLANNED" },
      createdAt: { gte: PERIOD_START },
    });
  });

  it("counts what the period bound held back so the screen can say so", async () => {
    const db = makeDb();
    db.workoutAssignment.count.mockImplementation(({ where }: { where: { createdAt?: { lt?: Date } } }) =>
      Promise.resolve(where.createdAt?.lt ? 3 : 0),
    );

    const result = await run(db);

    expect(result.heldBack).toBe(3);
    expect(db.workoutAssignment.count).toHaveBeenCalledWith({
      where: {
        schoolId: "school", athleteId: "athlete",
        status: { not: "UNPLANNED" }, createdAt: { lt: PERIOD_START },
      },
    });
  });

  it("falls back to the row creation date when the membership has no start date", async () => {
    const createdAt = new Date("2026-08-15T00:00:00.000Z");
    const db = makeDb({
      schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ id: "m", startedAt: null, createdAt }) },
    });

    const result = await run(db);

    expect(result.periodStart).toEqual(createdAt);
    expect(rowQuery(db).where.AND[0]).toMatchObject({ createdAt: { gte: createdAt } });
  });

  it("does not select athlete feedback, coach evaluations or wearable data", async () => {
    const db = makeDb();
    await run(db);

    const select = (db.workoutAssignment.findMany.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    expect(Object.keys(select)).not.toEqual(expect.arrayContaining(["feedbacks", "evaluations", "compliances"]));
    const executionSelect = (select.executions as { select: Record<string, unknown> }).select;
    expect(Object.keys(executionSelect)).not.toEqual(expect.arrayContaining(["feedback", "evaluations", "activityPayload"]));
  });
});

describe("GetSchoolAthleteTraining — filters", () => {
  const cases: [string, unknown][] = [
    ["todos", {}],
    ["proximos", { status: { in: ["SCHEDULED", "AVAILABLE"] }, OR: [{ scheduledAt: null }, { scheduledAt: { gte: TODAY } }] }],
    ["atrasados", { status: { in: ["SCHEDULED", "AVAILABLE"] }, scheduledAt: { lt: TODAY } }],
    // SAM-48 — a matched execution is "realizado"; the legacy done statuses still count.
    ["realizados", {
      OR: [
        { status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } },
        { executions: { some: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } } } },
      ],
    }],
    ["sem-execucao", { status: { in: ["MISSED", "CANCELLED", "RESCHEDULED", "JUSTIFIED"] } }],
  ];

  it.each(cases)("%s selects the right rows", async (filter, expected) => {
    const db = makeDb();
    await run(db, { filter });
    expect(rowQuery(db).where.AND[1]).toEqual(expected);
  });

  it("uses the same overdue boundary as the dashboard: before the start of today (UTC)", async () => {
    const db = makeDb();
    await run(db, { filter: "atrasados" });
    expect(rowQuery(db).where.AND[1]).toMatchObject({ scheduledAt: { lt: TODAY } });
  });

  it("returns a count for every filter", async () => {
    const db = makeDb();
    db.workoutAssignment.count.mockResolvedValue(4);

    const result = await run(db);

    expect(Object.keys(result.counts)).toEqual([...ATHLETE_TRAINING_FILTERS]);
    expect(Object.values(result.counts)).toEqual([4, 4, 4, 4, 4]);
  });

  it("reads upcoming work soonest-first and everything else newest-first, undated last", async () => {
    const upcoming = makeDb();
    await run(upcoming, { filter: "proximos" });
    expect(rowQuery(upcoming).orderBy).toEqual([{ scheduledAt: { sort: "asc", nulls: "last" } }, { id: "desc" }]);

    const all = makeDb();
    await run(all, { filter: "todos" });
    expect(rowQuery(all).orderBy).toEqual([{ scheduledAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
  });
});

describe("GetSchoolAthleteTraining — rows", () => {
  it("flags overdue only for open work dated before today", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([
      assignmentRow({ id: "late", status: "SCHEDULED", scheduledAt: new Date("2026-09-28T09:00:00.000Z") }),
      assignmentRow({ id: "today", status: "SCHEDULED", scheduledAt: new Date("2026-09-29T09:00:00.000Z") }),
      assignmentRow({ id: "undated", status: "AVAILABLE", scheduledAt: null }),
      assignmentRow({ id: "done", status: "COMPLETED", scheduledAt: new Date("2026-09-10T09:00:00.000Z") }),
    ]);

    const { items } = await run(db);

    expect(Object.fromEntries(items.map((item) => [item.id, item.overdue]))).toEqual({
      late: true, today: false, undated: false, done: false,
    });
  });

  it("turns Decimal block distances into plain numbers for the client", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([assignmentRow()]);

    const { items } = await run(db);

    expect(items[0].workout?.blocks[0].distanceM).toBe(5000);
  });

  it("keeps prescriptions without a structured workout, with their source label", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([
      assignmentRow({ workout: null, sourceLabel: "Marketplace: Corrida 5km" }),
    ]);

    const { items } = await run(db);

    expect(items[0].workout).toBeNull();
    expect(items[0].sourceLabel).toBe("Marketplace: Corrida 5km");
  });

  it("reports no coach when the prescription has none, so nobody is asked to revise it", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([assignmentRow({ coachId: null, coach: null })]);

    const { items } = await run(db);

    expect(items[0].coach).toBeNull();
  });

  it("maps the matched execution and its compliance score", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([assignmentRow({
      status: "COMPLETED",
      executions: [{
        id: "execution", source: "strava", startedAt: new Date("2026-09-20T09:00:00.000Z"),
        sportType: "running", durationSeconds: 1750, distanceMeters: 5100,
        averageHeartRate: 150, averagePower: null, compliance: { overallScore: 87 },
      }],
    })]);

    const { items } = await run(db);

    expect(items[0].execution).toMatchObject({ source: "strava", distanceMeters: 5100, complianceScore: 87 });
  });

  it("only asks for executions that really belong to the prescription", async () => {
    const db = makeDb();
    await run(db);

    const select = (db.workoutAssignment.findMany.mock.calls[0][0] as { select: { executions: { where: unknown } } }).select;
    expect(select.executions.where).toEqual({ matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } });
  });

  it("pages by fetching one extra row and never returns it", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([
      assignmentRow({ id: "a" }), assignmentRow({ id: "b" }), assignmentRow({ id: "c" }),
    ]);

    const result = await run(db, { limit: 2 });

    expect(rowQuery(db).take).toBe(3);
    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.hasMore).toBe(true);
  });

  it("reports the last page as complete", async () => {
    const db = makeDb();
    db.workoutAssignment.findMany.mockResolvedValue([assignmentRow({ id: "a" })]);

    const result = await run(db, { limit: 2 });

    expect(result.hasMore).toBe(false);
  });

  it("shows who is responsible and the athlete's teams", async () => {
    const result = await run(makeDb());

    expect(result.currentCoach).toEqual({ coachId: "coach", name: "Prof. Carlos" });
    expect(result.teams).toEqual(["Turma A"]);
    expect(result.athlete).toMatchObject({ id: "athlete", name: "Ana" });
  });
});
