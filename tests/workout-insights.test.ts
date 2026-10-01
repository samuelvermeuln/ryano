/**
 * SAM-17 — DTO provider-agnóstico do detalhe do treino: zonas com share, laps
 * numéricos, casamento bloco↔lap e vereditos; e o gate do caso de uso (só com
 * atividade vinculada e loader injetado, sem derrubar a página em falha).
 */
import { describe, expect, it, vi } from "vitest";
import { GetCoachAthleteWorkoutDetail } from "@/modules/school/application/get-coach-athlete-workout-detail";
import {
  buildOverlay,
  buildWorkoutInsights,
  buildZoneSections,
  expandBlocks,
  lapPaceSeconds,
  type InsightBlock,
} from "@/modules/school/presentation/workout-insights";
import type { ActivityLap, ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";

function block(overrides: Partial<InsightBlock> & { id: string }): InsightBlock {
  return {
    blockType: "INTERVAL", title: null, durationS: null, distanceM: null, repetitions: null,
    targetPayload: null, restPayload: null, ...overrides,
  };
}

function lap(index: number, overrides: Partial<ActivityLap> = {}): ActivityLap {
  return {
    index, durationSeconds: 240, distanceMeters: 1000, averageSpeed: null,
    averageHeartRate: null, maxHeartRate: null, averagePower: null, averageCadence: null, ...overrides,
  };
}

function visual(overrides: Partial<ActivityVisualData> = {}): ActivityVisualData {
  return {
    sportLabel: "Corrida", sportKey: "run", provider: "GARMIN", startedAtLabel: "x",
    heroStats: [], overviewMetrics: [], barSections: [], metricSections: [], ...overrides,
  };
}

describe("expandBlocks — leituras da estrutura como sequência de laps", () => {
  it("3×(4 min + 2 min descanso) + desaquecimento: entre reps = 6, após cada = 7, só trabalho = 4", () => {
    const blocks = [
      block({ id: "w", blockType: "WARMUP", durationS: 600 }),
      block({ id: "i", durationS: 240, repetitions: 3, restPayload: { durationS: 120 } }),
    ];
    const readings = expandBlocks(blocks);
    expect(readings.map((r) => r.length)).toEqual([6, 7, 4]);
    expect(readings[0].map((s) => s.kind)).toEqual(["work", "work", "rest", "work", "rest", "work"]);
    expect(readings[0][1]).toMatchObject({ blockIndex: 1, repetition: 1, kind: "work", durationS: 240 });
    expect(readings[0][2]).toMatchObject({ kind: "rest", durationS: 120 });
  });

  it("sem descanso, as três leituras colapsam em uma", () => {
    expect(expandBlocks([block({ id: "a", durationS: 600 }), block({ id: "b", durationS: 300, repetitions: 2 })]))
      .toHaveLength(1);
  });
});

describe("buildOverlay — casamento bloco↔lap e vereditos", () => {
  const blocks = [
    block({ id: "w", blockType: "WARMUP", durationS: 600, targetPayload: { heartRateMin: 110, heartRateMax: 130 } }),
    block({ id: "i", durationS: 240, repetitions: 2, targetPayload: { heartRateMin: 160, heartRateMax: 175 }, restPayload: { durationS: 120 } }),
  ];
  // Leitura "entre reps": aquecimento, rep1, descanso, rep2 = 4 laps.
  const laps = [
    lap(1, { durationSeconds: 610, averageHeartRate: 125 }),
    lap(2, { durationSeconds: 238, averageHeartRate: 168 }),
    lap(3, { durationSeconds: 125, averageHeartRate: 120 }),
    lap(4, { durationSeconds: 242, averageHeartRate: 181 }),
  ];

  it("alinha quando o número de laps bate com uma leitura e identifica o lap de recuperação", () => {
    const { rows, note } = buildOverlay(blocks, laps, "run");
    expect(note).toBeNull();
    expect(rows).toHaveLength(4);
    expect(rows!.map((r) => r.kind)).toEqual(["work", "work", "rest", "work"]);
    expect(rows!.map((r) => r.verdict)).toEqual(["within", "within", "unknown", "above"]);
    expect(rows![1].basis).toBe("heartRate");
    expect(rows![1].prescribed.targets).toEqual(["FC: 160–175 bpm"]);
    expect(rows![2].prescribed.durationS).toBe(120);
    expect(rows![2].prescribed.targets).toEqual([]); // o descanso não repete "2 min" como alvo
    expect(rows![3].lapIndex).toBe(4);
  });

  it("explica em vez de forçar quando a contagem não casa", () => {
    const { rows, note } = buildOverlay(blocks, laps.slice(0, 2), "run");
    expect(rows).toBeNull();
    expect(note).toContain("3 ou 4 ou 5 segmento(s)");
    expect(note).toContain("2 lap(s)");
  });

  it("decide por ritmo (±5%) quando não há alvo de FC, e por potência depois", () => {
    const paceBlocks = [block({ id: "p", distanceM: 1000, targetPayload: { paceSecPerKm: 300 } })];
    expect(buildOverlay(paceBlocks, [lap(1, { averageSpeed: 1000 / 300 })], "run").rows![0]).toMatchObject({ basis: "pace", verdict: "within" });
    expect(buildOverlay(paceBlocks, [lap(1, { averageSpeed: 1000 / 330 })], "run").rows![0]).toMatchObject({ basis: "pace", verdict: "below" });
    expect(buildOverlay(paceBlocks, [lap(1, { averageSpeed: 1000 / 270 })], "run").rows![0]).toMatchObject({ basis: "pace", verdict: "above" });

    const powerBlocks = [block({ id: "p", durationS: 300, targetPayload: { power: 200 } })];
    expect(buildOverlay(powerBlocks, [lap(1, { averagePower: 185 })], "bike").rows![0]).toMatchObject({ basis: "power", verdict: "below" });
    expect(buildOverlay(powerBlocks, [lap(1, {})], "bike").rows![0]).toMatchObject({ basis: null, verdict: "unknown" });
  });

  it("natação compara ritmo por 100 m", () => {
    const swimBlocks = [block({ id: "s", distanceM: 100, targetPayload: { paceSec100m: 100 } })];
    const swimLap = lap(1, { distanceMeters: 100, durationSeconds: 102, averageSpeed: null });
    expect(lapPaceSeconds(swimLap, true)).toBeCloseTo(102);
    expect(buildOverlay(swimBlocks, [swimLap], "swim").rows![0].verdict).toBe("within");
  });
});

describe("buildZoneSections / buildWorkoutInsights", () => {
  it("calcula o share de cada zona a partir dos segundos e ignora seções que não são zonas", () => {
    const data = visual({
      barSections: [
        { id: "heart-rate-zones", title: "Zonas de FC", description: "d", items: [
          { label: "Zona 1", valueText: "10 min", ratio: 0.5, color: "c", seconds: 600 },
          { label: "Zona 2", valueText: "20 min", ratio: 1, color: "c", seconds: 1200 },
        ] },
        { id: "splits", title: "Splits", description: "d", items: [{ label: "Lap 1", valueText: "x", ratio: 1, color: "c" }] },
      ],
    });
    const zones = buildZoneSections(data);
    expect(zones).toHaveLength(1);
    expect(zones[0].items.map((i) => i.share)).toEqual([1 / 3, 2 / 3]);
  });

  it("sem segundos numéricos o share é nulo (nada inventado); zonas aproximadas mantêm o aviso", () => {
    const data = visual({
      barSections: [{ id: "heart-rate-zones", title: "Z", description: "d", approximate: true, disclaimer: "estimado", items: [
        { label: "Zona 1", valueText: "x", ratio: 1, color: "c" },
      ] }],
    });
    const [zone] = buildZoneSections(data);
    expect(zone.items[0].share).toBeNull();
    expect(zone).toMatchObject({ approximate: true, disclaimer: "estimado" });
  });

  it("devolve null sem dado visual ou quando não há zonas nem laps; marca laps de recuperação pelo overlay", () => {
    expect(buildWorkoutInsights(null, [], "run")).toBeNull();
    expect(buildWorkoutInsights(visual(), [], "run")).toBeNull();

    const blocks = [block({ id: "i", durationS: 240, repetitions: 2, restPayload: { durationS: 60 } })];
    const insights = buildWorkoutInsights(visual({ laps: [lap(1), lap(2, { durationSeconds: 60 }), lap(3)] }), blocks, "run");
    expect(insights?.laps.map((l) => l.isRecovery)).toEqual([false, true, false]);
    expect(insights?.laps[0]).toMatchObject({ label: "Lap 1", paceLabel: "4:00 /km" });
    expect(insights?.overlay).toHaveLength(3);
  });
});

/** O gate do caso de uso: carrega o detalhe só com atividade vinculada e nunca derruba a página. */
describe("GetCoachAthleteWorkoutDetail — insights", () => {
  const NOW = new Date("2026-10-10T12:00:00.000Z");
  function makeDb(execution: Record<string, unknown> | null) {
    return {
      school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Alpha", status: "ACTIVE", timezone: "America/Sao_Paulo" }) },
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "m" }) },
      schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ startedAt: new Date("2026-01-01T00:00:00.000Z"), createdAt: new Date("2026-01-01T00:00:00.000Z") }) },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: null, image: null }) },
      coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "a", coachId: "coach", coach: { displayName: "Carlos", user: { name: "C" } } }) },
      teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
      workoutAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asg", athleteId: "athlete", schoolId: "school", scheduledAt: NOW, dueAt: null, status: "AVAILABLE",
          sourceLabel: null, createdAt: NOW, coachId: "coach", coach: null, team: null,
          workout: { id: "w", title: "Tiros", description: null, sportType: "run", blocks: [
            { id: "b", position: 0, blockType: "INTERVAL", title: null, durationS: 240, distanceM: null, repetitions: 2, targetPayload: { heartRateMin: 150, heartRateMax: 170 }, restPayload: { durationS: 60 } },
          ] },
          executions: execution ? [execution] : [],
          changeRequests: [], history: [],
        }),
      },
    };
  }
  const baseExecution = {
    id: "exec", source: "GARMIN", startedAt: NOW, sportType: "run", durationSeconds: 540, movingSeconds: null,
    distanceMeters: null, averageHeartRate: 160, maxHeartRate: 175, averageSpeed: null, elevationGain: null,
    averagePower: null, matchStatus: "CONFIRMED", matchScore: 90, compliance: null, feedback: null, evaluations: [],
  };

  it("com atividade vinculada chama o loader injetado e devolve zonas/laps/overlay", async () => {
    const activity = { id: "act", provider: "GARMIN" };
    const loader = vi.fn().mockResolvedValue(visual({
      barSections: [{ id: "heart-rate-zones", title: "Z", description: "d", items: [{ label: "Zona 2", valueText: "9 min", ratio: 1, color: "c", seconds: 540 }] }],
      laps: [lap(1, { averageHeartRate: 160 }), lap(2, { durationSeconds: 60, averageHeartRate: 120 }), lap(3, { averageHeartRate: 158 })],
    }));
    const db = makeDb({ ...baseExecution, activityId: "act", activity });
    const result = await new GetCoachAthleteWorkoutDetail(db as never, () => NOW, loader).execute("user", "school", "athlete", "asg");

    expect(loader).toHaveBeenCalledWith(activity);
    expect(result.execution?.hasLinkedActivity).toBe(true);
    expect(result.execution).not.toHaveProperty("activity");
    expect(result.insights?.zones).toHaveLength(1);
    expect(result.insights?.laps).toHaveLength(3);
    expect(result.insights?.overlay?.map((r) => r.verdict)).toEqual(["within", "unknown", "within"]);
  });

  it("sem atividade vinculada não chama o loader e insights é null", async () => {
    const loader = vi.fn();
    const db = makeDb({ ...baseExecution, activityId: null, activity: null });
    const result = await new GetCoachAthleteWorkoutDetail(db as never, () => NOW, loader).execute("user", "school", "athlete", "asg");
    expect(loader).not.toHaveBeenCalled();
    expect(result.insights).toBeNull();
    expect(result.execution?.hasLinkedActivity).toBe(false);
  });

  it("falha do provedor vira 'sem insights', não erro", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("garmin down"));
    const db = makeDb({ ...baseExecution, activityId: "act", activity: { id: "act", provider: "GARMIN" } });
    const result = await new GetCoachAthleteWorkoutDetail(db as never, () => NOW, loader).execute("user", "school", "athlete", "asg");
    expect(result.insights).toBeNull();
    expect(result.execution?.hasLinkedActivity).toBe(true);
  });
});
