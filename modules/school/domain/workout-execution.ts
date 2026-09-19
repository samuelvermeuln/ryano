import { z } from "zod";
import { WorkoutMatchStatus } from "./enums";

const opaqueId = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const workoutExecutionSchema = z.strictObject({
  id: opaqueId,
  workoutAssignmentId: opaqueId,
  athleteId: opaqueId,
  source: z.string().min(1).max(50),
  externalId: z.string().min(1).max(256),
  sportType: z.string().min(1).max(100),
  startedAt: z.date(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  movingSeconds: z.number().int().nonnegative().nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  averageHeartRate: z.number().int().nonnegative().nullable(),
  maxHeartRate: z.number().int().nonnegative().nullable(),
  averageSpeed: z.number().nonnegative().nullable(),
  elevationGain: z.number().nullable(),
  averagePower: z.number().int().nonnegative().nullable(),
  matchScore: z.number().int().min(0).max(100),
  matchStatus: z.enum(WorkoutMatchStatus),
  activityPayload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WorkoutExecution = z.infer<typeof workoutExecutionSchema>;

export interface CreateWorkoutExecutionInput {
  id: string;
  workoutAssignmentId: string;
  athleteId: string;
  source: string;
  externalId: string;
  sportType: string;
  startedAt: Date;
  durationSeconds?: number | null;
  movingSeconds?: number | null;
  distanceMeters?: number | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  averageSpeed?: number | null;
  elevationGain?: number | null;
  averagePower?: number | null;
  matchScore: number;
  matchStatus: WorkoutMatchStatus;
  activityPayload: Record<string, unknown>;
}

export function createWorkoutExecution(raw: CreateWorkoutExecutionInput, now: Date): WorkoutExecution {
  z.date().parse(now);
  return workoutExecutionSchema.parse({
    ...raw,
    durationSeconds: raw.durationSeconds ?? null,
    movingSeconds: raw.movingSeconds ?? null,
    distanceMeters: raw.distanceMeters ?? null,
    averageHeartRate: raw.averageHeartRate ?? null,
    maxHeartRate: raw.maxHeartRate ?? null,
    averageSpeed: raw.averageSpeed ?? null,
    elevationGain: raw.elevationGain ?? null,
    averagePower: raw.averagePower ?? null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
}
