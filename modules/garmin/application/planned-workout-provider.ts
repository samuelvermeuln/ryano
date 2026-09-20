/**
 * Garmin implementation of PlannedWorkoutProvider.
 *
 * Envia treinos estruturados ao Garmin Connect via o serviço proxy Ryvano
 * (`GARMIN_SERVICE_BASE_URL`). O proxy abstrai OAuth, refresh de token e
 * chama a Garmin Connect API (workout-service).
 *
 * Endpoints do proxy utilizados:
 *   POST /workouts         → cria e agenda o treino na conta do atleta
 *   DELETE /workouts/{id}  → remove o treino do Garmin Connect
 *
 * Mapeamentos baseados na Garmin Connect API (consultado 2026-09):
 *   Sport types:  https://connect.garmin.com/modern/proxy/activity-service/activity/activityTypes
 *   Step types:   WorkoutStep.stepType enum (WARMUP, COOLDOWN, INTERVAL, ACTIVE, REST, OTHER)
 *   Target types: targetType enum (NO_TARGET, SPEED, HEART_RATE, CADENCE, POWER, GRADE, RESISTANCE)
 */

import type {
  PlannedWorkoutInput,
  PlannedWorkoutProvider,
  PlannedWorkoutPushResult,
  PlannedWorkoutStep,
} from "@/modules/shared/integrations/contracts";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability";
import { createHttpClient } from "@/lib/http-client";
import { requireEnv } from "@/server/env";

// ---------------------------------------------------------------------------
// Garmin activity type IDs (Garmin Connect API)
// ---------------------------------------------------------------------------
const GARMIN_SPORT_TYPE: Record<string, number> = {
  running: 1,
  trail_running: 1,
  treadmill_running: 1,
  cycling: 2,
  road_biking: 2,
  mountain_biking: 2,
  indoor_cycling: 2,
  gravel_cycling: 2,
  swimming: 5,
  lap_swimming: 5,
  pool_swimming: 5,
  open_water_swimming: 5,
  walking: 9,
  hiking: 10,
  strength_training: 20,
  yoga: 43,
  pilates: 43,
  hiit: 211,
  crossfit: 211,
  elliptical: 15,
  rowing: 13,
  triathlon: 8,
  multisport: 8,
};

function garminSportType(sportType: string): number {
  return GARMIN_SPORT_TYPE[sportType.toLowerCase().replace(/ /g, "_")] ?? 17; // 17 = other
}

// ---------------------------------------------------------------------------
// Garmin step type mapping
// ---------------------------------------------------------------------------
type GarminStepType = "WARMUP" | "COOLDOWN" | "INTERVAL" | "ACTIVE" | "REST" | "OTHER";

const STEP_TYPE_MAP: Record<string, GarminStepType> = {
  WARMUP: "WARMUP",
  COOLDOWN: "COOLDOWN",
  INTERVAL: "INTERVAL",
  STEADY: "ACTIVE",
  RECOVERY: "REST",
  DRILL: "ACTIVE",
  FREE: "OTHER",
  CUSTOM: "OTHER",
};

// ---------------------------------------------------------------------------
// Duration condition types for Garmin
// ---------------------------------------------------------------------------
type GarminDurationType = "TIME" | "DISTANCE" | "OPEN" | "REPS";

// ---------------------------------------------------------------------------
// Target type mapping
// ---------------------------------------------------------------------------
type GarminTargetType = "NO_TARGET" | "SPEED" | "HEART_RATE" | "POWER";

interface GarminTarget {
  targetType: GarminTargetType;
  targetValueOne?: number;
  targetValueTwo?: number;
}

function buildGarminTarget(step: PlannedWorkoutStep): GarminTarget {
  const t = step.target;
  if (!t) return { targetType: "NO_TARGET" };

  if (t.power != null) {
    return { targetType: "POWER", targetValueOne: t.power * 0.95, targetValueTwo: t.power * 1.05 };
  }
  if (t.heartRateMin != null && t.heartRateMax != null) {
    return { targetType: "HEART_RATE", targetValueOne: t.heartRateMin, targetValueTwo: t.heartRateMax };
  }
  if (t.heartRateMin != null) {
    return { targetType: "HEART_RATE", targetValueOne: t.heartRateMin, targetValueTwo: t.heartRateMin + 10 };
  }
  if (t.paceSecPerKm != null && t.paceSecPerKm > 0) {
    // Garmin uses speed in m/s; pace s/km → speed = 1000 / pace
    const speedMs = 1000 / t.paceSecPerKm;
    // ±5% speed band
    return { targetType: "SPEED", targetValueOne: speedMs * 0.95, targetValueTwo: speedMs * 1.05 };
  }
  if (t.paceSec100m != null && t.paceSec100m > 0) {
    const speedMs = 100 / t.paceSec100m;
    return { targetType: "SPEED", targetValueOne: speedMs * 0.95, targetValueTwo: speedMs * 1.05 };
  }
  return { targetType: "NO_TARGET" };
}

// ---------------------------------------------------------------------------
// Build Garmin workout step DTO
// ---------------------------------------------------------------------------
interface GarminWorkoutStep {
  type: "ExecutableStepDTO" | "RepeatGroupDTO";
  stepOrder: number;
  stepType: GarminStepType;
  childStepId?: number;
  description?: string;
  // Duration
  endCondition: { conditionTypeKey: GarminDurationType };
  endConditionValue?: number;
  // Target
  targetType: { workoutTargetTypeKey: GarminTargetType };
  targetValueOne?: number;
  targetValueTwo?: number;
  // Rest (for intervals — handled as separate REST step)
}

function buildGarminStep(step: PlannedWorkoutStep, order: number): GarminWorkoutStep[] {
  const garminType = STEP_TYPE_MAP[step.stepType] ?? "OTHER";
  const target = buildGarminTarget(step);

  // Duration / distance
  let endCondition: GarminDurationType = "OPEN";
  let endConditionValue: number | undefined;
  if (step.durationSeconds != null && step.durationSeconds > 0) {
    endCondition = "TIME";
    endConditionValue = step.durationSeconds;
  } else if (step.distanceMeters != null && step.distanceMeters > 0) {
    endCondition = "DISTANCE";
    endConditionValue = step.distanceMeters;
  }

  const workStep: GarminWorkoutStep = {
    type: "ExecutableStepDTO",
    stepOrder: order,
    stepType: garminType,
    description: step.title ?? undefined,
    endCondition: { conditionTypeKey: endCondition },
    endConditionValue,
    targetType: { workoutTargetTypeKey: target.targetType },
    targetValueOne: target.targetValueOne,
    targetValueTwo: target.targetValueTwo,
  };

  const steps: GarminWorkoutStep[] = [workStep];

  // Add REST step if interval has a rest configuration
  if (garminType === "INTERVAL" && step.rest && step.rest.durationSeconds) {
    const restTarget: GarminTarget =
      step.rest.heartRateMin != null && step.rest.heartRateMax != null
        ? { targetType: "HEART_RATE", targetValueOne: step.rest.heartRateMin, targetValueTwo: step.rest.heartRateMax }
        : { targetType: "NO_TARGET" };
    steps.push({
      type: "ExecutableStepDTO",
      stepOrder: order + 1,
      stepType: "REST",
      endCondition: { conditionTypeKey: "TIME" },
      endConditionValue: step.rest.durationSeconds,
      targetType: { workoutTargetTypeKey: restTarget.targetType },
      targetValueOne: restTarget.targetValueOne,
      targetValueTwo: restTarget.targetValueTwo,
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Build Garmin workout DTO (payload for POST /workouts)
// ---------------------------------------------------------------------------
interface GarminWorkoutDTO {
  workoutName: string;
  sportType: { sportTypeId: number };
  estimatedDurationInSecs?: number;
  estimatedDistanceInMeters?: number;
  workoutSegments: Array<{
    segmentOrder: number;
    sportType: { sportTypeId: number };
    workoutSteps: GarminWorkoutStep[];
  }>;
}

function buildGarminWorkoutDTO(input: PlannedWorkoutInput): GarminWorkoutDTO {
  const sportTypeId = garminSportType(input.sportType);
  const allSteps: GarminWorkoutStep[] = [];
  let stepOrder = 1;

  for (const step of input.steps) {
    const built = buildGarminStep(step, stepOrder);
    allSteps.push(...built);
    stepOrder += built.length;
  }

  const totalDuration = input.steps.reduce((s, b) => s + (b.durationSeconds ?? 0), 0) || undefined;
  const totalDistance = input.steps.reduce((s, b) => s + (b.distanceMeters ?? 0), 0) || undefined;

  return {
    workoutName: input.title.slice(0, 50), // Garmin limit
    sportType: { sportTypeId },
    estimatedDurationInSecs: totalDuration,
    estimatedDistanceInMeters: totalDistance,
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId },
        workoutSteps: allSteps,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// HTTP client (reuses proxy pattern from GarminProvider)
// ---------------------------------------------------------------------------
let _client: ReturnType<typeof createHttpClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createHttpClient({
      baseURL: requireEnv("GARMIN_SERVICE_BASE_URL"),
      timeout: 15_000,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// GarminPlannedWorkoutProvider
// ---------------------------------------------------------------------------
export class GarminPlannedWorkoutProvider implements PlannedWorkoutProvider {
  async pushWorkout(input: PlannedWorkoutInput): Promise<PlannedWorkoutPushResult> {
    const dto = buildGarminWorkoutDTO(input);
    const scheduledDate = input.scheduledAt.toISOString().slice(0, 10);

    const response = await getClient().post<{ workoutId?: string; id?: string }>(
      "/workouts",
      {
        workout: dto,
        scheduledDate,
        workoutAssignmentId: input.workoutAssignmentId,
      },
      { headers: { "X-API-Key": input.accountApiKey } },
    );

    const externalWorkoutId = response.data.workoutId ?? response.data.id ?? "";
    if (!externalWorkoutId) {
      throw new Error("GARMIN_WORKOUT_PUSH_NO_ID");
    }

    logIntegrationEvent("info", "Garmin planned workout pushed", {
      provider: "GARMIN",
      operation: "push_workout",
      connectionId: input.workoutAssignmentId,
      status: "success",
    });

    return { externalWorkoutId };
  }

  async deleteWorkout(input: { accountApiKey: string; externalWorkoutId: string }): Promise<void> {
    try {
      await getClient().delete(`/workouts/${input.externalWorkoutId}`, {
        headers: { "X-API-Key": input.accountApiKey },
      });
    } catch (error: unknown) {
      // Silently ignore 404 — workout already removed
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return;
      }
      throw error;
    }
  }
}

export const garminPlannedWorkoutProvider = new GarminPlannedWorkoutProvider();
