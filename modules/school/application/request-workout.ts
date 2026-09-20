import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createWorkoutRequest } from "../domain/workout-request";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const requestWorkoutSchema = z.strictObject({
  schoolId: id,
  sportType: z.string().trim().min(1).max(100),
  preferredDate: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
  note: z.string().trim().max(2000).nullish().transform((v) => v ?? null),
});

/** Athlete asks a coach at a school where they have an active membership to prescribe a workout. */
export class RequestWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = requestWorkoutSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, status: true } });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const membership = await tx.schoolAthleteMembership.findFirst({
          where: { schoolId: input.schoolId, athleteId: actor.data, status: "ACTIVE" }, select: { id: true },
        });
        if (!membership) throw new SchoolError("ATHLETE_NOT_MEMBER", "Você não é membro ativo desta escola.", 403);

        const now = this.clock();
        const request = createWorkoutRequest({
          id: randomUUID(),
          athleteId: actor.data,
          schoolId: input.schoolId,
          sportType: input.sportType,
          preferredDate: input.preferredDate,
          note: input.note,
        }, now);

        const saved = await tx.workoutRequest.create({ data: request });

        await new AuditService(tx).log({
          schoolId: input.schoolId,
          actorUserId: actor.data,
          action: AuditAction.WORKOUT_REQUESTED,
          entityType: AuditEntityType.WORKOUT_REQUEST,
          entityId: saved.id,
          metadata: { sportType: input.sportType, preferredDate: input.preferredDate?.toISOString() ?? null },
        });

        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_REQUEST_CREATE_CONFLICT", "Não foi possível enviar o pedido. Tente novamente.", 409);
      }
      throw error;
    }
  }
}
