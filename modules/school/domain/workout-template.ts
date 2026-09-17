import { z } from "zod";
import { TemplateStatus, WorkoutOwnerType } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const nullableId = id.nullable();

export const workoutTemplateSchema = z.strictObject({
  id,
  ownerType: z.enum(WorkoutOwnerType),
  ownerId: id,
  authorCoachId: nullableId,
  schoolId: nullableId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  sportType: z.string().trim().min(1).max(100),
  version: z.number().int().min(1),
  status: z.enum(TemplateStatus),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((template, ctx) => {
  if (template.updatedAt < template.createdAt) ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  const ownerIsValid = (template.ownerType === WorkoutOwnerType.COACH && template.ownerId === template.authorCoachId && !template.schoolId)
    || (template.ownerType === WorkoutOwnerType.SCHOOL && template.ownerId === template.schoolId)
    || (template.ownerType === WorkoutOwnerType.SYSTEM && !template.authorCoachId && !template.schoolId);
  if (!ownerIsValid) ctx.addIssue({ code: "custom", path: ["ownerType"], message: "Owner fields do not match owner type" });
});

export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;
export type CreateWorkoutTemplateInput = Omit<WorkoutTemplate, "status" | "createdAt" | "updatedAt"> & { status?: TemplateStatus };

export function createWorkoutTemplate(raw: CreateWorkoutTemplateInput, now: Date): WorkoutTemplate {
  return workoutTemplateSchema.parse({ ...raw, status: raw.status ?? TemplateStatus.DRAFT, createdAt: now, updatedAt: now });
}
