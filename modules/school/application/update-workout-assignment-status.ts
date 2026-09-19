import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import type { WorkoutAssignment, WorkoutAssignmentHistory } from "../domain/workout-assignment";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const updateWorkoutAssignmentStatusSchema = z.strictObject({
  assignmentId: id,
  status: z.enum(WorkoutAssignmentStatus),
  reason: z.string().max(2000).optional(),
});

export type UpdateWorkoutAssignmentStatusInput = z.infer<typeof updateWorkoutAssignmentStatusSchema>;

export interface WorkoutAssignmentStatusRepository {
  findById(id: string): Promise<WorkoutAssignment | null>;
  updateStatus(id: string, status: WorkoutAssignmentStatus, updatedAt: Date): Promise<WorkoutAssignment>;
  saveHistory(record: Omit<WorkoutAssignmentHistory, "id" | "createdAt">): Promise<WorkoutAssignmentHistory>;
}

export class UpdateWorkoutAssignmentStatus {
  constructor(private readonly repo: WorkoutAssignmentStatusRepository) {}

  async execute(
    actor: { userId: string | null; isActive: boolean },
    raw: unknown,
    now: Date = new Date(),
  ): Promise<WorkoutAssignment> {
    const actorId = id.safeParse(actor.userId);
    if (!actorId.success || !actor.isActive) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }

    const input = updateWorkoutAssignmentStatusSchema.parse(raw);

    const assignment = await this.repo.findById(input.assignmentId);
    if (!assignment) throw new SchoolError("STORE_NOT_FOUND", "Prescrição de treino não encontrada.", 404);

    if (assignment.status === input.status) return assignment;

    const previousStatus = assignment.status;
    const updated = await this.repo.updateStatus(input.assignmentId, input.status, now);

    await this.repo.saveHistory({
      workoutAssignmentId: input.assignmentId,
      eventType: input.status,
      actorUserId: actorId.data,
      payload: { previousStatus, ...(input.reason !== undefined && { reason: input.reason }) },
    } as Omit<WorkoutAssignmentHistory, "id" | "createdAt"> & { id?: string });

    return { ...updated, status: input.status, updatedAt: now };
  }
}
