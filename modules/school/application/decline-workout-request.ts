import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutRequestStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const declineWorkoutRequestSchema = z.strictObject({
  requestId: id,
  declineReason: z.string().trim().max(2000).nullish().transform((v) => v ?? null),
});

/** Coach declines a pending WorkoutRequest — no Workout/WorkoutAssignment is created. */
export class DeclineWorkoutRequest {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = declineWorkoutRequestSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, status: true } });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        const request = await tx.workoutRequest.findUnique({ where: { id: input.requestId } });
        if (!request) throw new SchoolError("WORKOUT_REQUEST_NOT_FOUND", "Pedido de treino não encontrado.", 404);
        if (request.status !== WorkoutRequestStatus.PENDING) {
          throw new SchoolError("WORKOUT_REQUEST_NOT_PENDING", "Este pedido já foi decidido.", 409);
        }

        const membership = await tx.coachSchoolMembership.findFirst({
          where: { schoolId: request.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
        });
        if (!membership) {
          throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);
        }

        const now = this.clock();
        const updated = await tx.workoutRequest.update({
          where: { id: request.id },
          data: { status: WorkoutRequestStatus.DECLINED, decidedBy: actor.data, decidedAt: now, declineReason: input.declineReason, updatedAt: now },
        });

        await new AuditService(tx).log({
          schoolId: request.schoolId,
          actorUserId: actor.data,
          action: AuditAction.WORKOUT_REQUEST_DECLINED,
          entityType: AuditEntityType.WORKOUT_REQUEST,
          entityId: request.id,
          metadata: { declineReason: input.declineReason },
        });

        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_REQUEST_NOT_PENDING", "Este pedido foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
