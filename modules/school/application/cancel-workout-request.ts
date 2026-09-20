import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutRequestStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Athlete cancels their own still-pending request. Not wired to any UI yet —
 * ready for a future "my requests" screen.
 */
export class CancelWorkoutRequest {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, requestId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(requestId);
    if (!target.success) throw new SchoolError("WORKOUT_REQUEST_NOT_FOUND", "Pedido de treino não encontrado.", 404);

    try {
      return await this.db.$transaction(async (tx) => {
        const request = await tx.workoutRequest.findUnique({ where: { id: target.data } });
        if (!request || request.athleteId !== actor.data) {
          throw new SchoolError("WORKOUT_REQUEST_NOT_FOUND", "Pedido de treino não encontrado.", 404);
        }
        if (request.status !== WorkoutRequestStatus.PENDING) {
          throw new SchoolError("WORKOUT_REQUEST_NOT_PENDING", "Este pedido já foi decidido.", 409);
        }

        const now = this.clock();
        return await tx.workoutRequest.update({
          where: { id: request.id },
          data: { status: WorkoutRequestStatus.CANCELLED, decidedBy: actor.data, decidedAt: now, updatedAt: now },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_REQUEST_NOT_PENDING", "Este pedido foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
