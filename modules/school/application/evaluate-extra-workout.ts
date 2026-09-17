import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { WorkoutAssignmentStatus } from "../domain/enums";

// ADR-XXXX: Extra workouts are unassigned activities mapped to a generic 'completed' workout assignment. 

export const evaluateExtraWorkoutSchema = z.strictObject({
  athleteId: z.string().min(1),
  activityId: z.string().min(1), // the normalized activity ID
  metadata: z.any().optional(),
});

export type EvaluateExtraWorkoutInput = z.infer<typeof evaluateExtraWorkoutSchema>;

export interface EvaluateExtraWorkoutRepository {
    createExtraAssignment(athleteId: string, activityId: string, now: Date, metadata?: any): Promise<any>;
}

export class EvaluateExtraWorkout {
  constructor(private readonly repo: EvaluateExtraWorkoutRepository) {}

  async execute(input: EvaluateExtraWorkoutInput, now: Date) {
    const data = evaluateExtraWorkoutSchema.parse(input);
    const assignment = await this.repo.createExtraAssignment(data.athleteId, data.activityId, now, data.metadata);
    return assignment;
  }
}
