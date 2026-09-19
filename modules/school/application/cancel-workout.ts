import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";

type JsonPayload = Prisma.InputJsonValue;

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const cancelWorkoutSchema = z.strictObject({
  assignmentId: id,
  reason: z.string().max(2000).optional(),
});

const cancellableStatuses = new Set<string>([
  WorkoutAssignmentStatus.SCHEDULED,
  WorkoutAssignmentStatus.AVAILABLE,
  WorkoutAssignmentStatus.RESCHEDULED,
]);

/** Cancels a scheduled workout assignment; only the assigning coach may cancel. */
export class CancelWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = cancelWorkoutSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const assignment = await tx.workoutAssignment.findUnique({ where: { id: input.assignmentId } });
        if (!assignment) throw new SchoolError("STORE_NOT_FOUND", "Prescrição de treino não encontrada.", 404);
        if (!cancellableStatuses.has(assignment.status)) {
          throw new SchoolError("WORKOUT_INVALID_TRANSITION", "O treino não pode ser cancelado neste estado.", 409);
        }

        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
        if (!coach || coach.id !== assignment.coachId) {
          throw new SchoolError("FORBIDDEN", "Apenas o professor responsável pode cancelar este treino.", 403);
        }

        const now = this.clock();
        const historyPayload: JsonPayload = {
          previousStatus: assignment.status,
          ...(input.reason !== undefined && { reason: input.reason }),
        };
        const [updated] = await Promise.all([
          tx.workoutAssignment.update({
            where: { id: input.assignmentId },
            data: { status: WorkoutAssignmentStatus.CANCELLED, updatedAt: now },
          }),
          tx.workoutAssignmentHistory.create({
            data: { id: randomUUID(), workoutAssignmentId: input.assignmentId, eventType: "CANCELLED", actorUserId: actor.data, payload: historyPayload, createdAt: now },
          }),
        ]);

        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_ASSIGN_CONFLICT", "A prescrição foi alterada. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
