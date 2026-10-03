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
} from "@/modules/shared/integrations/contracts";
import { planGarminWorkout, type ExportNote, type GarminWorkoutStep } from "./planned-workout-export";
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
// Build Garmin workout DTO (payload for POST /workouts)
// SAM-49 — steps, omissions and conversions come from `planGarminWorkout`
// (repetitions, rest between them, no invented target bands).
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

export function buildGarminWorkoutDTO(input: PlannedWorkoutInput): { dto: GarminWorkoutDTO; notes: ExportNote[] } {
  const sportTypeId = garminSportType(input.sportType);
  const plan = planGarminWorkout(input.title, input.steps);

  return {
    dto: {
      workoutName: plan.workoutName,
      sportType: { sportTypeId },
      estimatedDurationInSecs: plan.estimatedDurationSeconds ?? undefined,
      estimatedDistanceInMeters: plan.estimatedDistanceMeters ?? undefined,
      workoutSegments: [{ segmentOrder: 1, sportType: { sportTypeId }, workoutSteps: plan.steps }],
    },
    notes: plan.notes,
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
    const { dto, notes } = buildGarminWorkoutDTO(input);
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

    return { externalWorkoutId, providerMeta: { notes } };
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
