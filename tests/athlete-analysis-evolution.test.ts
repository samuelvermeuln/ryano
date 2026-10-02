/**
 * SAM-44 — o caso de uso devolve a série por atividade (com os extras do
 * modelo rico, o RPE e o resultado prescrito × executado) e a aderência
 * expandida, no mesmo escopo e janela do restante da análise; a administração
 * da escola lê a mesma análise no escopo da escola.
 */
import { describe, expect, it, vi } from "vitest";
import { GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";

const SP = "America/Sao_Paulo";
const NOW = new Date("2026-10-07T12:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");

const EXECUTION = {
  id: "e1", startedAt: new Date("2026-10-01T10:00:00.000Z"), durationSeconds: 1700, distanceMeters: 5500, sportType: "run",
  averageHeartRate: 152, averageSpeed: 3.2, activityId: "a1", source: "GARMIN", externalId: "g1",
  assignment: { status: "COMPLETED" }, activity: { metrics: null },
};
const ACTIVITY_LINKED = { id: "a1", provider: "GARMIN", externalId: "g1", startedAt: EXECUTION.startedAt, sportType: "run", durationSeconds: 1700, movingSeconds: null, distanceMeters: 5500, averageHeartRate: 152, averageSpeed: 3.2, metrics: null };
const ACTIVITY_SWIM = { id: "a2", provider: "GARMIN", externalId: "g2", startedAt: new Date("2026-10-03T10:00:00.000Z"), sportType: "swim", durationSeconds: 1800, movingSeconds: null, distanceMeters: 1500, averageHeartRate: 130, averageSpeed: 0.83, metrics: null };

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "ACTIVE", timezone: SP }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "m" }) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: null, image: null }) },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(args.where.isPrimary === true ? { coachId: "coach", coach: { displayName: "C", user: { name: "C" } } } : { id: "own" })),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    workoutAssignment: {
      findMany: vi.fn().mockResolvedValue([
        { status: "COMPLETED", workout: { sportType: "run", blocks: [{ durationS: 600, repetitions: 3 }] }, executions: [{ sportType: "run", durationSeconds: 1700 }] },
        { status: "MISSED", workout: { sportType: "bike", blocks: [{ durationS: 3600, repetitions: 1 }] }, executions: [] },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
    workoutExecution: {
      findMany: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve("id" in args.where
          ? [{ id: "e1", sportType: "run", activityId: "a1", assignment: { status: "COMPLETED", workout: { sportType: "run" } }, activity: { maxHeartRate: 178, averageStrokeRate: null, averageDistancePerStroke: null, averageSwolf: null } }]
          : [EXECUTION])),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    activity: {
      findMany: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve("id" in args.where
          ? [{ id: "a2", maxHeartRate: 150, averageStrokeRate: 28, averageDistancePerStroke: 1.2, averageSwolf: 41 }]
          : [ACTIVITY_LINKED, ACTIVITY_SWIM])),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    athleteTechnicalSheet: { findUnique: vi.fn().mockResolvedValue(null) },
    workoutCompliance: { aggregate: vi.fn().mockResolvedValue({ _avg: { overallScore: 80 }, _count: { _all: 1 } }) },
    athleteFeedback: { findMany: vi.fn().mockResolvedValue([{ workoutExecutionId: "e1", activityId: null, rpe: 7 }, { workoutExecutionId: null, activityId: "a2", rpe: 4 }]) },
    historyAccessGrant: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

describe("GetCoachAthleteAnalysis — evolução por atividade e aderência expandida (SAM-44)", () => {
  it("um ponto por sessão com extras do modelo rico, RPE e resultado; natação com os quatro indicadores", async () => {
    const result = await new GetCoachAthleteAnalysis(makeDb() as never, () => NOW).execute("user", "school", "athlete", { windowDays: 28 });

    expect(result.activities.map((point) => point.id)).toEqual(["execution:e1", "activity:a2"]);
    expect(result.activities[0]).toMatchObject({ activityId: "a1", outcome: "EXECUTED_AS_PLANNED", rpe: 7, maxHeartRate: 178, paceUnit: "per-km", origin: "prescribed" });
    expect(result.activities[1]).toMatchObject({ activityId: "a2", outcome: "UNPLANNED_ACTIVITY", rpe: 4, strokeRate: 28, distancePerStroke: 1.2, swolf: 41, paceUnit: "per-100m" });
    expect(Math.round(result.activities[1]!.paceSeconds!)).toBe(120);
    // Totais batem com as sessões da janela.
    expect(result.activities).toHaveLength(result.totals.sessions);

    expect(result.adherenceDetail.byOutcome).toEqual({ EXECUTED_AS_PLANNED: 1, EXECUTED_PARTIALLY: 0, EXECUTED_DIFFERENTLY: 0, PLANNED_NOT_EXECUTED: 1 });
    expect(result.adherenceDetail.plannedDurationSeconds).toBe(5400);
    expect(result.adherenceDetail.executedDurationSeconds).toBe(1700);
    expect(result.adherenceDetail.plannedPerWeek).toBe(0.4);
  });

  it("a administração da escola lê a análise no escopo da escola (prescrições da escola, fuso da escola)", async () => {
    // An OWNER with no CoachProfile: the hub gate would refuse, the school-admin scope must not.
    const db = makeDb({
      coachProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "sm", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null }) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "sm", role: "OWNER" }]) },
    });
    const result = await new GetCoachAthleteAnalysis(db as never, () => NOW).execute("owner", { kind: "school-admin", schoolId: "school" }, "athlete", { windowDays: 28 });
    expect(result.context.reader).toBe("school-admin");
    expect(result.timeZone).toBe(SP);
    expect(db.workoutAssignment.count.mock.calls[0][0].where.AND[0]).toMatchObject({ schoolId: "school" });
    expect(result.activities).toHaveLength(2);
  });
});
