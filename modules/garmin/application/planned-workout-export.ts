/**
 * SAM-49 — what a Ryvano prescription becomes on a Garmin watch, and what it
 * loses on the way (§11.4: "Mostrar passos omitidos ou convertidos; não
 * comunicar exportação fiel quando o dispositivo não aceita o conteúdo").
 *
 * Pure: steps in, Garmin steps + an honest list of omissions/conversions out.
 *
 * Contract boundary. The push goes through the Ryvano Garmin proxy
 * (`GARMIN_SERVICE_BASE_URL`) with the step shape this module already sent
 * before SAM-49 (ExecutableStepDTO with TIME/DISTANCE/OPEN end conditions and
 * NO_TARGET/HEART_RATE/SPEED/POWER targets). The Garmin Training API
 * specification is only available to approved developer-program members
 * (developer.garmin.com/gc-developer-program/training-api, consulted
 * 03/10/2026), so this module does NOT introduce structures it cannot verify
 * — notably repeat groups. Repetitions are sent as the same steps in
 * sequence, which the watch executes identically, and the conversion is
 * reported. Repeat groups come with SAM-77 once the spec is accessible.
 *
 * Never invents a value (AC07): a single power or pace value is not turned
 * into a ±5% band, and a lone minimum heart rate does not get +10 bpm.
 */
import type { PlannedWorkoutStep } from "@/modules/shared/integrations/contracts";

export type GarminStepType = "WARMUP" | "COOLDOWN" | "INTERVAL" | "ACTIVE" | "REST" | "OTHER";
export type GarminDurationType = "TIME" | "DISTANCE" | "OPEN";
export type GarminTargetType = "NO_TARGET" | "SPEED" | "HEART_RATE" | "POWER";

export interface GarminWorkoutStep {
  type: "ExecutableStepDTO";
  stepOrder: number;
  stepType: GarminStepType;
  description?: string;
  endCondition: { conditionTypeKey: GarminDurationType };
  endConditionValue?: number;
  targetType: { workoutTargetTypeKey: GarminTargetType };
  targetValueOne?: number;
  targetValueTwo?: number;
}

export type ExportNote = {
  /** 1-based block position in the prescription. */
  block: number;
  kind: "omitted" | "converted";
  /** What was affected, in the coach's words ("Distância", "RPE 7", "4 repetições"). */
  item: string;
  reason: string;
};

export type GarminWorkoutPlan = {
  workoutName: string;
  steps: GarminWorkoutStep[];
  notes: ExportNote[];
  /** Σ of the TIME steps sent (efforts and rests); null when no step is timed. */
  estimatedDurationSeconds: number | null;
  /** Σ repetitions × distance of the blocks that prescribe one; null when none does. */
  estimatedDistanceMeters: number | null;
};

/** Garmin limit kept from the integration; reported when it truncates. */
export const GARMIN_WORKOUT_NAME_MAX = 50;

const STEP_TYPE_MAP: Record<PlannedWorkoutStep["stepType"], GarminStepType> = {
  WARMUP: "WARMUP",
  COOLDOWN: "COOLDOWN",
  INTERVAL: "INTERVAL",
  STEADY: "ACTIVE",
  RECOVERY: "REST",
  DRILL: "ACTIVE",
  FREE: "OTHER",
  CUSTOM: "OTHER",
};

type Target = { type: GarminTargetType; one?: number; two?: number };

function chooseTarget(step: PlannedWorkoutStep, block: number, notes: ExportNote[]): Target {
  const target = step.target;
  if (!target) return { type: "NO_TARGET" };

  const candidates: Array<{ label: string; target: Target | null; reason?: string }> = [];
  if (target.heartRateMin != null && target.heartRateMax != null) {
    candidates.push({ label: `FC ${target.heartRateMin}–${target.heartRateMax} bpm`, target: { type: "HEART_RATE", one: target.heartRateMin, two: target.heartRateMax } });
  } else if (target.heartRateMin != null || target.heartRateMax != null) {
    candidates.push({ label: "FC com um só limite", target: null, reason: "o relógio recebe uma faixa; a prescrição tem só um limite e a Ryvano não inventa o outro" });
  }
  if (target.power != null) {
    candidates.push({ label: `Potência ${target.power} W`, target: null, reason: "o relógio recebe uma faixa; a prescrição tem um valor único e a Ryvano não inventa margem" });
  }
  if (target.paceSecPerKm != null) {
    candidates.push({ label: "Ritmo por km", target: null, reason: "o relógio recebe uma faixa de velocidade; a prescrição tem um ritmo único e a Ryvano não inventa margem" });
  }
  if (target.paceSec100m != null) {
    candidates.push({ label: "Ritmo por 100 m", target: null, reason: "o relógio recebe uma faixa de velocidade; a prescrição tem um ritmo único e a Ryvano não inventa margem" });
  }
  if (target.zone != null) {
    candidates.push({ label: `Zona ${target.zone}`, target: null, reason: "as zonas da Ryvano vêm da ficha técnica e não correspondem às zonas configuradas no relógio" });
  }
  if (target.rpe != null) {
    candidates.push({ label: `RPE ${target.rpe}`, target: null, reason: "percepção de esforço não é um alvo que o relógio mede" });
  }

  const chosen = candidates.find((candidate) => candidate.target !== null)?.target ?? { type: "NO_TARGET" as const };
  for (const candidate of candidates) {
    if (candidate.target === chosen) continue;
    notes.push({
      block, kind: "omitted", item: candidate.label,
      reason: candidate.reason ?? "o relógio recebe um alvo por passo; o primeiro alvo em faixa foi o enviado",
    });
  }
  return chosen;
}

/**
 * The prescription's blocks as Garmin steps. Rest is read BETWEEN repetitions
 * (6 × 100 m com 20 s = five rests, §11.2 — the same rule as `plannedTotals`);
 * a single-repetition block keeps its one rest.
 */
export function planGarminWorkout(title: string, steps: readonly PlannedWorkoutStep[]): GarminWorkoutPlan {
  const notes: ExportNote[] = [];
  const out: GarminWorkoutStep[] = [];
  let order = 1;

  steps.forEach((step, index) => {
    const block = index + 1;
    const stepType = STEP_TYPE_MAP[step.stepType] ?? "OTHER";
    const target = chooseTarget(step, block, notes);

    let endCondition: GarminDurationType = "OPEN";
    let endConditionValue: number | undefined;
    if (step.durationSeconds != null && step.durationSeconds > 0) {
      endCondition = "TIME";
      endConditionValue = step.durationSeconds;
      if (step.distanceMeters != null && step.distanceMeters > 0) {
        notes.push({ block, kind: "omitted", item: `Distância (${step.distanceMeters} m)`, reason: "cada passo do relógio termina por tempo ou por distância; foi enviado o tempo" });
      }
    } else if (step.distanceMeters != null && step.distanceMeters > 0) {
      endCondition = "DISTANCE";
      endConditionValue = step.distanceMeters;
    } else {
      notes.push({ block, kind: "converted", item: "Término", reason: "sem duração nem distância: o passo termina quando o atleta apertar volta" });
    }

    const reps = step.repetitions != null && step.repetitions > 1 ? step.repetitions : 1;
    const restSeconds = step.rest?.durationSeconds != null && step.rest.durationSeconds > 0 ? step.rest.durationSeconds : null;
    const restTarget: Target = step.rest?.heartRateMin != null && step.rest.heartRateMax != null
      ? { type: "HEART_RATE", one: step.rest.heartRateMin, two: step.rest.heartRateMax }
      : { type: "NO_TARGET" };
    if (reps > 1) {
      notes.push({ block, kind: "converted", item: `${reps} repetições`, reason: "enviadas como passos em sequência (mesma execução no relógio, sem grupo de repetição)" });
    }

    for (let rep = 1; rep <= reps; rep += 1) {
      out.push({
        type: "ExecutableStepDTO",
        stepOrder: order++,
        stepType,
        description: step.title ?? undefined,
        endCondition: { conditionTypeKey: endCondition },
        endConditionValue,
        targetType: { workoutTargetTypeKey: target.type },
        targetValueOne: target.one,
        targetValueTwo: target.two,
      });
      const restHere = restSeconds !== null && (reps === 1 || rep < reps);
      if (restHere) {
        out.push({
          type: "ExecutableStepDTO",
          stepOrder: order++,
          stepType: "REST",
          endCondition: { conditionTypeKey: "TIME" },
          endConditionValue: restSeconds,
          targetType: { workoutTargetTypeKey: restTarget.type },
          targetValueOne: restTarget.one,
          targetValueTwo: restTarget.two,
        });
      }
    }
  });

  let workoutName = title;
  if (title.length > GARMIN_WORKOUT_NAME_MAX) {
    workoutName = title.slice(0, GARMIN_WORKOUT_NAME_MAX);
    notes.push({ block: 0, kind: "converted", item: "Título", reason: `encurtado para ${GARMIN_WORKOUT_NAME_MAX} caracteres` });
  }

  const timed = out.filter((step) => step.endCondition.conditionTypeKey === "TIME");
  const withDistance = steps.filter((step) => step.distanceMeters != null && step.distanceMeters > 0);
  return {
    workoutName,
    steps: out,
    notes,
    estimatedDurationSeconds: timed.length > 0 ? timed.reduce((sum, step) => sum + (step.endConditionValue ?? 0), 0) : null,
    estimatedDistanceMeters: withDistance.length > 0
      ? withDistance.reduce((sum, step) => sum + (step.distanceMeters ?? 0) * Math.max(1, step.repetitions ?? 1), 0)
      : null,
  };
}
