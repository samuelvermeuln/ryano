import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";

// Activities performed outside any prescription are stored with UNPLANNED status (required.md §45).
// The repository decides the concrete persistence strategy; the use case only expresses intent.

export const evaluateExtraWorkoutSchema = z.strictObject({
  athleteId: z.string().min(1),
  activityId: z.string().min(1),
  metadata: z.unknown().optional(),
});

export type EvaluateExtraWorkoutInput = z.infer<typeof evaluateExtraWorkoutSchema>;

export interface ExtraWorkoutRecord {
  id: string;
  athleteId: string;
  activityId: string;
  status: typeof WorkoutAssignmentStatus.UNPLANNED;
  createdAt: Date;
  metadata?: unknown;
}

export interface EvaluateExtraWorkoutRepository {
  createExtraAssignment(athleteId: string, activityId: string, now: Date, metadata?: unknown): Promise<ExtraWorkoutRecord>;
}

export class EvaluateExtraWorkout {
  constructor(private readonly repo: EvaluateExtraWorkoutRepository) {}

  async execute(input: EvaluateExtraWorkoutInput, now: Date): Promise<ExtraWorkoutRecord> {
    const data = evaluateExtraWorkoutSchema.parse(input);
    return this.repo.createExtraAssignment(data.athleteId, data.activityId, now, data.metadata);
  }
}
