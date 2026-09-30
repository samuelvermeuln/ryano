/**
 * SAM-5 — resumo da prescrição para o modal de treino e as linhas de alvo por
 * bloco (inclui o descanso, que antes nunca era exibido).
 */
import { describe, expect, it } from "vitest";

import { describeBlockTargets } from "@/modules/school/presentation/workout-blocks";
import { summarizeWorkoutBlocks } from "@/modules/school/presentation/workout-summary";

const block = (over: Partial<Parameters<typeof summarizeWorkoutBlocks>[0] extends readonly (infer B)[] | null ? B : never> = {}) => ({
  blockType: "STEADY",
  durationS: null,
  distanceM: null,
  repetitions: null,
  targetPayload: null,
  restPayload: null,
  ...over,
});

describe("describeBlockTargets", () => {
  it("renderiza o descanso guardado como durationS no restPayload", () => {
    expect(describeBlockTargets({ durationS: 120 })).toEqual(["2 min"]);
    expect(describeBlockTargets({ durationS: 45 })).toEqual(["45 s"]);
    expect(describeBlockTargets({ durationS: 90, heartRateMax: 130 })).toEqual(["1 min 30 s", "FC: máx. 130 bpm"]);
  });

  it("mostra FC com apenas um dos limites em vez de sumir", () => {
    expect(describeBlockTargets({ heartRateMin: 150 })).toEqual(["FC: mín. 150 bpm"]);
    expect(describeBlockTargets({ heartRateMin: 150, heartRateMax: 165 })).toEqual(["FC: 150–165 bpm"]);
  });
});

describe("summarizeWorkoutBlocks", () => {
  it("sem blocos: nada estimado, nada inventado", () => {
    expect(summarizeWorkoutBlocks(null)).toEqual({ estimatedDurationSeconds: null, plannedDistanceMeters: null, intensityTargets: [], highIntensity: false });
    expect(summarizeWorkoutBlocks([])).toMatchObject({ estimatedDurationSeconds: null });
  });

  it("estima tempo com repetições e descanso, e distância com repetições", () => {
    const summary = summarizeWorkoutBlocks([
      block({ blockType: "WARMUP", durationS: 600, targetPayload: { zone: 1 } }),
      block({ blockType: "INTERVAL", distanceM: 1000, durationS: 300, repetitions: 4, targetPayload: { paceSecPerKm: 285 }, restPayload: { durationS: 120 } }),
      block({ blockType: "COOLDOWN", durationS: 600 }),
    ]);

    // 600 + 4×(300+120) + 600
    expect(summary.estimatedDurationSeconds).toBe(2880);
    expect(summary.plannedDistanceMeters).toBe(4000);
    expect(summary.intensityTargets).toEqual(["Zona 1", "Pace: 4:45 /km"]);
    expect(summary.highIntensity).toBe(true);
  });

  it("bloco só por distância não entra no tempo, e treino leve não é marcado como intenso", () => {
    const summary = summarizeWorkoutBlocks([
      block({ blockType: "STEADY", distanceM: 8000, targetPayload: { zone: 2, rpe: 4 } }),
    ]);
    expect(summary.estimatedDurationSeconds).toBeNull();
    expect(summary.plannedDistanceMeters).toBe(8000);
    expect(summary.highIntensity).toBe(false);
  });

  it("zona ≥ 4 ou RPE ≥ 8 marcam intensidade alta mesmo sem intervalos", () => {
    expect(summarizeWorkoutBlocks([block({ durationS: 1200, targetPayload: { zone: 4 } })]).highIntensity).toBe(true);
    expect(summarizeWorkoutBlocks([block({ durationS: 1200, targetPayload: { rpe: 8 } })]).highIntensity).toBe(true);
    expect(summarizeWorkoutBlocks([block({ durationS: 1200, targetPayload: { rpe: 7 } })]).highIntensity).toBe(false);
  });
});
