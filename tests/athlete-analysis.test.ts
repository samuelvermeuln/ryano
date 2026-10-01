/**
 * SAM-20 — análise do atleta: semanas no fuso da escola, volume prescrito ×
 * não prescrito, tendências, carga por FC (ADR-007), histórico sem N+1 e com
 * cursor, alertas do resumo.
 */
import { describe, expect, it, vi } from "vitest";
import {
  aggregateBySport,
  aggregateWeeks,
  sessionWeekStart,
  summarizeWindow,
  type AnalysisSession,
} from "@/modules/school/domain/athlete-analysis";
import { canEstimateHeartRateLoad, heartRateLoad } from "@/modules/school/domain/training-load";
import { GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";
import { GetCoachAthleteOverview } from "@/modules/school/application/get-coach-athlete-overview";
import { GetCoachAthleteTimeline, decodeTimelineCursor, encodeTimelineCursor } from "@/modules/school/application/get-coach-athlete-timeline";
import { loadAthleteSessions } from "@/modules/school/application/load-athlete-sessions";

const SP = "America/Sao_Paulo";
const NO_LOAD = { restingHeartRate: null, thresholdHeartRate: null, maxHeartRate: null };
const LOAD = { restingHeartRate: 50, thresholdHeartRate: 170, maxHeartRate: 190 };

function session(overrides: Partial<Omit<AnalysisSession, "startedAt">> & { id: string; startedAt: string }): AnalysisSession {
  return {
    origin: "prescribed", sportType: "run", durationSeconds: 3600, distanceMeters: 10000,
    averageHeartRate: null, averageSpeed: null, zoneSeconds: null,
    ...overrides, startedAt: new Date(overrides.startedAt),
  };
}

describe("semanas no fuso da escola", () => {
  it("domingo 22h em Brasília (01:00Z de segunda) fica na semana que termina nesse domingo", () => {
    // 2026-10-04 é domingo. 22:00 BRT = 2026-10-05T01:00Z.
    expect(sessionWeekStart(new Date("2026-10-05T01:00:00.000Z"), SP)).toBe("2026-09-28");
    // Em UTC seria segunda 05/10 → semana de 05/10.
    expect(sessionWeekStart(new Date("2026-10-05T01:00:00.000Z"), "UTC")).toBe("2026-10-05");
  });

  it("aggregateWeeks mantém toda semana da janela, separa prescrito de não prescrito e pondera FC pelo tempo", () => {
    const weeks = aggregateWeeks([
      session({ id: "a", startedAt: "2026-09-29T09:00:00.000Z", averageHeartRate: 150, durationSeconds: 3600 }),
      session({ id: "b", startedAt: "2026-10-05T01:00:00.000Z", origin: "unprescribed", averageHeartRate: 120, durationSeconds: 1800, distanceMeters: 5000, zoneSeconds: [600, 1200, 0, 0, 0] }),
      session({ id: "c", startedAt: "2026-10-07T09:00:00.000Z" }),
    ], "2026-09-28", "2026-10-12", SP, NO_LOAD);

    expect(weeks.map((week) => week.weekStart)).toEqual(["2026-09-28", "2026-10-05"]);
    expect(weeks[0].prescribed.sessions).toBe(1);
    expect(weeks[0].unprescribed).toEqual({ sessions: 1, durationSeconds: 1800, distanceMeters: 5000 });
    expect(weeks[0].total.durationSeconds).toBe(5400);
    expect(weeks[0].averageHeartRate).toBe(140); // (150×3600 + 120×1800) / 5400
    expect(weeks[0].zoneSeconds).toEqual([600, 1200, 0, 0, 0]);
    expect(weeks[0].heartRateLoad).toBeNull(); // sem parâmetros da ficha
    expect(weeks[1].total.sessions).toBe(1);
    expect(weeks[1].zoneSeconds).toBeNull();
  });

  it("tendência por modalidade: velocidade ponderada pela distância", () => {
    const [run] = aggregateBySport([
      session({ id: "a", startedAt: "2026-10-01T09:00:00.000Z", durationSeconds: 3000, distanceMeters: 10000 }),
      session({ id: "b", startedAt: "2026-10-02T09:00:00.000Z", durationSeconds: 1200, distanceMeters: 5000, averageHeartRate: 160 }),
    ]);
    expect(run.sportType).toBe("run");
    expect(run.averageSpeed).toBeCloseTo(15000 / 4200);
    expect(run.averageHeartRate).toBe(160);
  });
});

describe("carga por FC (hrTSS, ADR-007)", () => {
  it("exemplo documentado: repouso 50, limiar 170, máx 190; 60 min a 160 bpm ≈ 84", () => {
    expect(heartRateLoad({ durationSeconds: 3600, averageHeartRate: 160 }, LOAD)).toBe(84);
    // Uma hora na FC de limiar = 100, por construção.
    expect(heartRateLoad({ durationSeconds: 3600, averageHeartRate: 170 }, LOAD)).toBe(100);
    expect(heartRateLoad({ durationSeconds: 1800, averageHeartRate: 170 }, LOAD)).toBe(50);
  });

  it("só existe com os três parâmetros válidos e com FC média na sessão", () => {
    expect(canEstimateHeartRateLoad(LOAD)).toBe(true);
    expect(canEstimateHeartRateLoad({ ...LOAD, restingHeartRate: null })).toBe(false);
    expect(canEstimateHeartRateLoad({ ...LOAD, thresholdHeartRate: 195 })).toBe(false); // limiar > máx
    expect(heartRateLoad({ durationSeconds: 3600, averageHeartRate: null }, LOAD)).toBeNull();
    expect(summarizeWindow([session({ id: "a", startedAt: "2026-10-01T09:00:00.000Z", averageHeartRate: 160 })], LOAD).heartRateLoad).toBe(84);
    expect(summarizeWindow([session({ id: "a", startedAt: "2026-10-01T09:00:00.000Z", averageHeartRate: 160 })], NO_LOAD).heartRateLoad).toBeNull();
  });
});

describe("loadAthleteSessions — toda atividade, sem contar duas vezes", () => {
  it("execução casada + auto-relato + atividade importada sem execução; a atividade por trás de uma execução é descartada", async () => {
    const db = {
      workoutExecution: { findMany: vi.fn().mockResolvedValue([
        { id: "e1", startedAt: new Date("2026-10-01T09:00:00.000Z"), durationSeconds: 3600, distanceMeters: 10000, sportType: "run", averageHeartRate: 150, averageSpeed: null, activityId: "act-1", source: "GARMIN", externalId: "g1", assignment: { status: "COMPLETED" }, activity: { metrics: { hrTimeInZone_2: 3600 } } },
        { id: "e2", startedAt: new Date("2026-10-02T09:00:00.000Z"), durationSeconds: 1800, distanceMeters: null, sportType: "gym", averageHeartRate: null, averageSpeed: null, activityId: null, source: "self-report", externalId: "x", assignment: { status: "UNPLANNED" }, activity: null },
        { id: "e3", startedAt: new Date("2026-10-03T09:00:00.000Z"), durationSeconds: 1800, distanceMeters: 5000, sportType: "run", averageHeartRate: null, averageSpeed: null, activityId: null, source: "strava", externalId: "s9", assignment: { status: "COMPLETED" }, activity: null },
      ]) },
      activity: { findMany: vi.fn().mockResolvedValue([
        { id: "act-1", provider: "GARMIN", externalId: "g1", startedAt: new Date("2026-10-01T09:00:00.000Z"), sportType: "run", durationSeconds: 3600, movingSeconds: 3500, distanceMeters: 10000, averageHeartRate: 150, averageSpeed: null, metrics: null },
        { id: "act-2", provider: "STRAVA", externalId: "s9", startedAt: new Date("2026-10-03T09:00:00.000Z"), sportType: "run", durationSeconds: 1800, movingSeconds: null, distanceMeters: 5000, averageHeartRate: null, averageSpeed: null, metrics: null },
        { id: "act-3", provider: "STRAVA", externalId: "s10", startedAt: new Date("2026-10-04T09:00:00.000Z"), sportType: "bike", durationSeconds: 5400, movingSeconds: 5000, distanceMeters: 40000, averageHeartRate: 130, averageSpeed: 8, metrics: null },
      ]) },
    };
    const sessions = await loadAthleteSessions(db as never, {
      athleteId: "ath", schoolId: "school", periodStart: new Date("2026-09-01T00:00:00.000Z"),
      from: new Date("2026-09-28T03:00:00.000Z"), until: new Date("2026-10-12T03:00:00.000Z"),
    });
    expect(sessions.map((s) => [s.id, s.origin])).toEqual([
      ["execution:e1", "prescribed"], ["execution:e2", "unprescribed"], ["execution:e3", "prescribed"], ["activity:act-3", "unprescribed"],
    ]);
    expect(sessions[0].zoneSeconds).toEqual([0, 3600, 0, 0, 0]);
    expect(sessions[3].durationSeconds).toBe(5000); // tempo em movimento quando existe
  });
});

/** Mocks compartilhados pelos casos de uso com o gate do atleta. */
function makeDb(overrides: Record<string, unknown> = {}) {
  const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");
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
    workoutAssignment: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    workoutExecution: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    activity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    athleteTechnicalSheet: { findUnique: vi.fn().mockResolvedValue(null) },
    workoutCompliance: { aggregate: vi.fn().mockResolvedValue({ _avg: { overallScore: null }, _count: { _all: 0 } }) },
    workoutChangeRequest: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    workoutAssignmentHistory: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    coachEvaluation: { findMany: vi.fn().mockResolvedValue([]) },
    athleteFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    historyAccessGrant: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

describe("GetCoachAthleteAnalysis — janela no fuso da escola e janela anterior", () => {
  it("a janela começa numa segunda local e é consultada em UTC (03:00Z em São Paulo)", async () => {
    const db = makeDb({ schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ startedAt: new Date("2020-01-01T00:00:00.000Z"), createdAt: new Date("2020-01-01T00:00:00.000Z") }) } });
    // Quarta 2026-10-07 12:00Z; 28 dias para trás cai em 10/09 (quinta), que vira a segunda 07/09.
    const result = await new GetCoachAthleteAnalysis(db as never, () => new Date("2026-10-07T12:00:00.000Z"))
      .execute("user", "school", "athlete", { windowDays: 28 });

    expect(result.from).toBe("2026-09-07");
    expect(result.weekEnd).toBe("2026-10-12");
    expect(result.weeks.map((w) => w.weekStart)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
    // A leitura cobre também a janela anterior (28 dias antes), para a comparação; limites em UTC = meia-noite local (03:00Z).
    const where = db.workoutExecution.findMany.mock.calls[0][0].where;
    expect(where.startedAt).toEqual({ gte: new Date("2026-08-10T03:00:00.000Z"), lt: new Date("2026-10-12T03:00:00.000Z") });
    expect(result.previous).not.toBeNull();
    expect(result.heartRateLoadAvailable).toBe(false);
  });

  it("filtro de modalidade usa o mesmo campo nas execuções e nas atividades", async () => {
    const db = makeDb();
    await new GetCoachAthleteAnalysis(db as never, () => new Date("2026-10-07T12:00:00.000Z"))
      .execute("user", "school", "athlete", { windowDays: 28, sportType: "run" });
    expect(db.workoutExecution.findMany.mock.calls[0][0].where.sportType).toBe("run");
    expect(db.activity.findMany.mock.calls[0][0].where.sportType).toBe("run");
  });
});

describe("GetCoachAthleteOverview — semana de calendário e alertas", () => {
  const NOW = new Date("2026-10-07T12:00:00.000Z"); // quarta

  it("sem fatos registrados, nenhum alerta além da inatividade (nunca treinou)", async () => {
    const db = makeDb();
    const result = await new GetCoachAthleteOverview(db as never, () => NOW).execute("user", "school", "athlete");
    expect(result.weekStart).toBe("2026-10-05");
    expect(result.alerts.map((a) => a.kind)).toEqual(["inactive"]);
  });

  it("gera alertas reais: alteração recente, solicitação pendente, cuidados, e pico de volume de 30%+", async () => {
    const weekSession = (id: string, startedAt: string, durationSeconds: number) => ({
      id, startedAt: new Date(startedAt), durationSeconds, distanceMeters: null, sportType: "run", averageHeartRate: null,
      averageSpeed: null, activityId: null, source: "GARMIN", externalId: id, assignment: { status: "COMPLETED" }, activity: null,
    });
    const db = makeDb({
      workoutExecution: {
        findMany: vi.fn().mockResolvedValue([
          // 4 semanas anteriores: 1 h por semana.
          weekSession("w1", "2026-09-09T09:00:00.000Z", 3600),
          weekSession("w2", "2026-09-16T09:00:00.000Z", 3600),
          weekSession("w3", "2026-09-23T09:00:00.000Z", 3600),
          weekSession("w4", "2026-09-30T09:00:00.000Z", 3600),
          // Semana atual: 2 h (+100%).
          weekSession("now", "2026-10-06T09:00:00.000Z", 7200),
        ]),
        findFirst: vi.fn().mockResolvedValue({ startedAt: new Date("2026-10-06T09:00:00.000Z") }),
      },
      workoutChangeRequest: { count: vi.fn().mockResolvedValue(2) },
      workoutAssignmentHistory: { count: vi.fn().mockResolvedValue(1) },
      athleteTechnicalSheet: { findUnique: vi.fn().mockResolvedValue({ restrictions: "joelho" }) },
    });
    const result = await new GetCoachAthleteOverview(db as never, () => NOW).execute("user", "school", "athlete");
    expect(result.thisWeek).toEqual({ sessions: 1, durationSeconds: 7200, distanceMeters: 0, unprescribedSessions: 0 });
    expect(result.previousWeek.durationSeconds).toBe(3600);
    expect(result.alerts.map((a) => a.kind)).toEqual(["workout-changed", "change-request-pending", "restriction", "volume-spike"]);
    expect(result.alerts[3].message).toContain("100%");
  });
});

describe("GetCoachAthleteTimeline — consentimento em lote e cursor", () => {
  function feedbackRow(id: string, startedAt: string) {
    return {
      id, rpe: 7, mood: null, energy: null, comment: null, createdAt: new Date(startedAt), workoutAssignmentId: "asg",
      execution: { startedAt: new Date(startedAt) }, assignment: { sourceLabel: null, workout: { title: "Treino" } },
    };
  }

  it("resolve o consentimento com uma consulta de grants, não uma por feedback (sem N+1)", async () => {
    const feedbacks = Array.from({ length: 30 }, (_, i) => feedbackRow(`f${i}`, `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T09:00:00.000Z`));
    const db = makeDb({
      athleteFeedback: { findMany: vi.fn().mockResolvedValue(feedbacks) },
      historyAccessGrant: {
        findMany: vi.fn().mockResolvedValue([{ fromDate: new Date("2026-09-15T00:00:00.000Z"), toDate: null }]),
        findFirst: vi.fn(),
      },
    });
    const result = await new GetCoachAthleteTimeline(db as never, () => new Date("2026-10-07T12:00:00.000Z"))
      .execute("user", "school", "athlete", { limit: 50 });

    expect(db.historyAccessGrant.findMany).toHaveBeenCalledTimes(1);
    expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
    // 2026-09-15..28 autorizados (14 dias), o resto retido.
    const shown = result.entries.filter((e) => e.kind === "feedback").length;
    expect(shown + result.feedbackWithheld).toBe(30);
    expect(result.feedbackWithheld).toBeGreaterThan(0);
    expect(result.entries.every((e) => e.kind !== "feedback" || e.occurredAt >= new Date("2026-09-15T00:00:00.000Z"))).toBe(true);
  });

  it("pagina por cursor: a segunda página começa estritamente depois da última entrada mostrada", async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: `ev${i}`, eventType: "ASSIGNED", createdAt: new Date(`2026-09-2${i}T09:00:00.000Z`), workoutAssignmentId: "asg",
      actor: { name: "C", email: null }, workoutAssignment: { sourceLabel: null, workout: { title: "T" } },
    }));
    const findMany = vi.fn().mockImplementation(({ where }: { where: { createdAt?: { lte: Date } } }) =>
      Promise.resolve(events
        .filter((e) => !where.createdAt || e.createdAt <= where.createdAt.lte)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())));
    const db = makeDb({ workoutAssignmentHistory: { findMany, count: vi.fn() } });
    const timeline = new GetCoachAthleteTimeline(db as never, () => new Date("2026-10-07T12:00:00.000Z"));

    const first = await timeline.execute("user", "school", "athlete", { limit: 2 });
    expect(first.entries.map((e) => e.id)).toEqual(["event:ev4", "event:ev3"]);
    expect(first.hasMore).toBe(true);
    expect(decodeTimelineCursor(first.nextCursor!)).toEqual({ occurredAt: events[3].createdAt, id: "event:ev3" });

    const second = await timeline.execute("user", "school", "athlete", { limit: 2, cursor: first.nextCursor! });
    expect(second.entries.map((e) => e.id)).toEqual(["event:ev2", "event:ev1"]);
    const third = await timeline.execute("user", "school", "athlete", { limit: 2, cursor: second.nextCursor! });
    expect(third.entries.map((e) => e.id)).toEqual(["event:ev0"]);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    expect(encodeTimelineCursor({ occurredAt: events[0].createdAt, id: "x" })).toBe("2026-09-20T09:00:00.000Z|x");
  });
});
