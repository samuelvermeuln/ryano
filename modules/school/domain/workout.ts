import { z } from "zod";
import { WorkoutStatus } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const nullableId = id.nullable();
const json = z.json();

function immutableSnapshot<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): unknown => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const nested of Object.values(item)) freeze(nested);
    }
    return item;
  };
  return freeze(copy) as T;
}

export const workoutSnapshotSchema = z.strictObject({
  templateId: nullableId,
  templateVersion: z.number().int().min(1).nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  sportType: z.string().trim().min(1).max(100),
  content: json,
}).refine((snapshot) => (snapshot.templateId === null) === (snapshot.templateVersion === null), {
  path: ["templateVersion"], message: "Template identity and version must be supplied together",
});
export type WorkoutSnapshot = z.infer<typeof workoutSnapshotSchema>;

export const workoutSchema = z.strictObject({
  id,
  templateId: nullableId,
  templateVersion: z.number().int().min(1).nullable(),
  authorCoachId: nullableId,
  originSchoolId: nullableId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  sportType: z.string().trim().min(1).max(100),
  scheduledDate: copiedDate.nullable(),
  scheduledStartAt: copiedDate.nullable(),
  status: z.enum(WorkoutStatus),
  snapshotPayload: workoutSnapshotSchema,
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((workout, ctx) => {
  if (workout.updatedAt < workout.createdAt) ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  if (workout.templateId !== workout.snapshotPayload.templateId || workout.templateVersion !== workout.snapshotPayload.templateVersion) {
    ctx.addIssue({ code: "custom", path: ["snapshotPayload"], message: "Snapshot template identity must match workout" });
  }
});

export type Workout = z.infer<typeof workoutSchema>;
export type CreateWorkoutInput = Omit<Workout, "status" | "createdAt" | "updatedAt" | "snapshotPayload"> & { status?: WorkoutStatus; snapshotPayload: WorkoutSnapshot };

export function createWorkoutSnapshot(raw: WorkoutSnapshot): WorkoutSnapshot {
  return immutableSnapshot(workoutSnapshotSchema.parse(raw));
}

export function createWorkout(raw: CreateWorkoutInput, now: Date): Workout {
  const snapshotPayload = createWorkoutSnapshot(raw.snapshotPayload);
  const workout = workoutSchema.parse({ ...raw, snapshotPayload, status: raw.status ?? WorkoutStatus.DRAFT, createdAt: now, updatedAt: now });
  return { ...workout, snapshotPayload: createWorkoutSnapshot(workout.snapshotPayload) };
}
