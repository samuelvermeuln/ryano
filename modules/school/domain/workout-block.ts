import { z } from "zod";
import { WorkoutBlockType } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const json = z.json();

export const workoutBlockSchema = z.strictObject({
  id,
  workoutId: id,
  position: z.number().int().min(0),
  blockType: z.enum(WorkoutBlockType),
  title: z.string().trim().min(1).max(200).nullable(),
  distanceM: z.number().finite().min(0).nullable(),
  durationS: z.number().int().min(0).nullable(),
  repetitions: z.number().int().min(0).nullable(),
  targetPayload: json.nullable(),
  restPayload: json.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).refine((block) => block.updatedAt >= block.createdAt, { path: ["updatedAt"], message: "Update cannot precede creation" });

export type WorkoutBlock = z.infer<typeof workoutBlockSchema>;
export type CreateWorkoutBlockInput = Omit<WorkoutBlock, "createdAt" | "updatedAt">;

export function createWorkoutBlock(raw: CreateWorkoutBlockInput, now: Date): WorkoutBlock {
  return workoutBlockSchema.parse({ ...raw, createdAt: now, updatedAt: now });
}
