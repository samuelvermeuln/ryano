/**
 * SAM-44 — pontos por atividade (ritmo pela regra da modalidade, natação com
 * braçadas/SWOLF, RPE, carga) e aderência expandida (quatro status, volume e
 * frequência planejados × reais). Ausência nunca vira zero.
 */
import { describe, expect, it } from "vitest";
import type { AnalysisSession } from "@/modules/school/domain/athlete-analysis";
import { buildActivityPoints, plannedDurationOfBlocks, summarizeAdherence } from "@/modules/school/domain/athlete-evolution";

const SP = "America/Sao_Paulo";
const NO_LOAD = { restingHeartRate: null, thresholdHeartRate: null, maxHeartRate: null };

function session(id: string, overrides: Partial<AnalysisSession> = {}): AnalysisSession {
  return {
    id, origin: "unprescribed", startedAt: new Date("2026-10-02T10:00:00.000Z"), sportType: "run",
    durationSeconds: 1800, distanceMeters: 6000, averageHeartRate: 150, averageSpeed: 3.33, zoneSeconds: null, ...overrides,
  };
}

describe("buildActivityPoints", () => {
  it("ordena por data local, deriva ritmo /km ou /100 m pela modalidade e carrega os extras", () => {
    const sessions = [
      session("execution:e1", { origin: "prescribed", startedAt: new Date("2026-10-03T10:00:00.000Z") }),
      session("activity:a1", { sportType: "swim", distanceMeters: 1500, durationSeconds: 1800, averageSpeed: 0.83 }),
      session("activity:a2", { sportType: "bike", averageSpeed: 8 }),
    ];
    const extras = new Map([
      ["execution:e1", { activityId: "x", outcome: "EXECUTED_AS_PLANNED" as const, rpe: 7, maxHeartRate: 175 }],
      ["activity:a1", { strokeRate: 28, distancePerStroke: 1.2, swolf: 41 }],
    ]);
    const points = buildActivityPoints(sessions, extras, SP, NO_LOAD);

    expect(points.map((point) => point.id)).toEqual(["activity:a1", "activity:a2", "execution:e1"]);
    const swim = points[0]!;
    expect(swim).toMatchObject({ activityId: "a1", date: "2026-10-02", paceUnit: "per-100m", strokeRate: 28, distancePerStroke: 1.2, swolf: 41, outcome: "UNPLANNED_ACTIVITY", rpe: null, heartRateLoad: null });
    expect(Math.round(swim.paceSeconds!)).toBe(120);
    expect(points[1]).toMatchObject({ paceSeconds: null, paceUnit: null, activityId: "a2" });
    expect(points[2]).toMatchObject({ activityId: "x", outcome: "EXECUTED_AS_PLANNED", rpe: 7, maxHeartRate: 175, paceUnit: "per-km" });
    expect(Math.round(points[2]!.paceSeconds!)).toBe(300);
  });
});

describe("summarizeAdherence", () => {
  it("quatro status, volume planejado × real e frequência semanal; canceladas não contam; sem plano = null", () => {
    const blocks = [{ durationS: 600, distanceM: null, repetitions: 3 }, { durationS: null, distanceM: 1000, repetitions: 1 }];
    expect(plannedDurationOfBlocks(blocks)).toBe(1800);
    expect(plannedDurationOfBlocks([{ durationS: null, distanceM: null, repetitions: null }])).toBeNull();
    // SAM-48 — same formula as plannedTotals: rest between repetitions counts (3 reps → 2 pauses).
    expect(plannedDurationOfBlocks([{ durationS: 600, distanceM: null, repetitions: 3, restPayload: { durationS: 60 } }])).toBe(1920);

    const detail = summarizeAdherence([
      { status: "COMPLETED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: { sportType: "run", durationSeconds: 1700 } },
      { status: "PARTIALLY_COMPLETED", workoutSportType: "run", plannedDurationSeconds: 2400, matchedExecution: { sportType: "run", durationSeconds: 1200 } },
      { status: "COMPLETED", workoutSportType: "bike", plannedDurationSeconds: null, matchedExecution: { sportType: "swim", durationSeconds: 1500 } },
      { status: "MISSED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: null },
      { status: "CANCELLED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: null },
    ], 2);

    expect(detail.byOutcome).toEqual({ EXECUTED_AS_PLANNED: 1, EXECUTED_PARTIALLY: 1, EXECUTED_DIFFERENTLY: 1, PLANNED_NOT_EXECUTED: 1 });
    expect(detail.counted).toBe(4);
    expect(detail.plannedDurationSeconds).toBe(6000);
    expect(detail.executedDurationSeconds).toBe(4400);
    expect(detail.plannedPerWeek).toBe(2);
    expect(detail.executedPerWeek).toBe(1.5);
    expect(detail.notExecuted).toEqual({ justified: 0, missed: 1, noRecord: 0 });
    expect(summarizeAdherence([], 4).plannedDurationSeconds).toBeNull();
    expect(summarizeAdherence([], 4).executedDurationSeconds).toBeNull();
  });

  it("SAM-48 — execução sem duração fica fora da soma (não medida, nunca 0) e as faltas se separam (AC11, AC12)", () => {
    const detail = summarizeAdherence([
      { status: "AVAILABLE", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: { sportType: "run", durationSeconds: null } },
      { status: "AVAILABLE", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: { sportType: "run", durationSeconds: 1500 } },
      { status: "JUSTIFIED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: null },
      { status: "MISSED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: null },
      { status: "SCHEDULED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: null },
      { status: "RESCHEDULED", workoutSportType: "run", plannedDurationSeconds: 1800, matchedExecution: null },
    ], 1);
    expect(detail.executedDurationSeconds).toBe(1500);
    expect(detail.unmeasuredExecutions).toBe(1);
    expect(detail.notExecuted).toEqual({ justified: 1, missed: 1, noRecord: 1 });
    expect(detail.counted).toBe(5);
  });
});
