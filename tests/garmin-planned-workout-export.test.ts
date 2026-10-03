/**
 * SAM-49 — what reaches the watch, and an honest list of what does not
 * (§11.4, §21.6, AC07: nothing invented).
 */
import { describe, expect, it } from "vitest";

import { planGarminWorkout } from "@/modules/garmin/application/planned-workout-export";
import { toPlannedWorkoutSteps } from "@/modules/school/application/planned-workout-steps";
import type { PlannedWorkoutStep } from "@/modules/shared/integrations/contracts";

const step = (over: Partial<PlannedWorkoutStep>): PlannedWorkoutStep => ({ stepType: "INTERVAL", ...over });

describe("planGarminWorkout", () => {
  it("4 × (5 min + 2 min de descanso) vira 4 esforços e 3 descansos em sequência, com a conversão informada", () => {
    const plan = planGarminWorkout("Tiros", [step({ durationSeconds: 300, repetitions: 4, rest: { durationSeconds: 120 } })]);
    expect(plan.steps.map((s) => `${s.stepType}:${s.endConditionValue}`)).toEqual([
      "INTERVAL:300", "REST:120", "INTERVAL:300", "REST:120", "INTERVAL:300", "REST:120", "INTERVAL:300",
    ]);
    expect(plan.steps.map((s) => s.stepOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.notes).toContainEqual(expect.objectContaining({ block: 1, kind: "converted", item: "4 repetições" }));
    expect(plan.estimatedDurationSeconds).toBe(4 * 300 + 3 * 120);
  });

  it("6 × 100 m de natação termina por distância", () => {
    const plan = planGarminWorkout("Natação", [step({ distanceMeters: 100, repetitions: 6, rest: { durationSeconds: 20 } })]);
    expect(plan.steps.filter((s) => s.stepType === "INTERVAL").every((s) => s.endCondition.conditionTypeKey === "DISTANCE" && s.endConditionValue === 100)).toBe(true);
    expect(plan.steps.filter((s) => s.stepType === "REST")).toHaveLength(5);
    expect(plan.estimatedDistanceMeters).toBe(600);
  });

  it("bloco de uma repetição mantém o próprio descanso", () => {
    const plan = planGarminWorkout("Contínuo", [step({ stepType: "STEADY", durationSeconds: 600, rest: { durationSeconds: 60 } })]);
    expect(plan.steps.map((s) => s.stepType)).toEqual(["ACTIVE", "REST"]);
  });

  it("nunca inventa faixa: potência, ritmo e FC com um limite só não viram alvo e aparecem como omitidos (AC07)", () => {
    const plan = planGarminWorkout("Alvos", [
      step({ durationSeconds: 300, target: { power: 250 } }),
      step({ durationSeconds: 300, target: { paceSecPerKm: 300 } }),
      step({ durationSeconds: 300, target: { heartRateMin: 150 } }),
    ]);
    for (const sent of plan.steps) {
      expect(sent.targetType.workoutTargetTypeKey).toBe("NO_TARGET");
      expect(sent.targetValueOne).toBeUndefined();
      expect(sent.targetValueTwo).toBeUndefined();
    }
    expect(plan.notes.filter((note) => note.kind === "omitted").map((note) => note.item)).toEqual([
      "Potência 250 W", "Ritmo por km", "FC com um só limite",
    ]);
  });

  it("faixa de FC explícita vai; RPE e zona do mesmo bloco ficam listados como omitidos", () => {
    const plan = planGarminWorkout("FC", [step({ durationSeconds: 600, target: { heartRateMin: 140, heartRateMax: 155, rpe: 6, zone: 3 } })]);
    expect(plan.steps[0]).toMatchObject({ targetType: { workoutTargetTypeKey: "HEART_RATE" }, targetValueOne: 140, targetValueTwo: 155 });
    expect(plan.notes.map((note) => note.item)).toEqual(["Zona 3", "RPE 6"]);
  });

  it("só RPE: vai sem alvo e o RPE aparece como omitido", () => {
    const plan = planGarminWorkout("RPE", [step({ durationSeconds: 600, target: { rpe: 7 } })]);
    expect(plan.steps[0]!.targetType.workoutTargetTypeKey).toBe("NO_TARGET");
    expect(plan.notes).toEqual([expect.objectContaining({ kind: "omitted", item: "RPE 7" })]);
  });

  it("tempo e distância no mesmo bloco: vai o tempo e a distância é listada; título longo é encurtado com aviso", () => {
    const longTitle = "x".repeat(60);
    const plan = planGarminWorkout(longTitle, [step({ durationSeconds: 300, distanceMeters: 1000 })]);
    expect(plan.steps[0]!.endCondition.conditionTypeKey).toBe("TIME");
    expect(plan.workoutName).toHaveLength(50);
    expect(plan.notes.map((note) => note.item)).toEqual(["Distância (1000 m)", "Título"]);
  });

  it("prescrição sem nada a converter não gera aviso", () => {
    expect(planGarminWorkout("Simples", [step({ stepType: "WARMUP", durationSeconds: 600 })]).notes).toEqual([]);
  });
});

describe("toPlannedWorkoutSteps", () => {
  it("lê o descanso de restPayload.durationS (a chave que a prescrição grava) e o RPE do alvo", () => {
    const [mapped] = toPlannedWorkoutSteps([{
      blockType: "INTERVAL", title: null, durationS: 300, distanceM: "1000", repetitions: 4,
      targetPayload: { rpe: 8, heartRateMin: 150, heartRateMax: 165 }, restPayload: { durationS: 120 },
    }]);
    expect(mapped).toMatchObject({
      durationSeconds: 300, distanceMeters: 1000, repetitions: 4,
      target: { rpe: 8, heartRateMin: 150, heartRateMax: 165 },
      rest: { durationSeconds: 120 },
    });
  });
});
