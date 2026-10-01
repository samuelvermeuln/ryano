import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutChangeRequestStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkoutChangeRequest } from "../domain/workout-change-request";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { resolveWorkoutAssignmentParticipant } from "./workout-assignment-participant";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const requestWorkoutChangeAsAthleteSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000),
});

/**
 * SAM-27 — the athlete asks the coach who wrote a prescription to change it.
 *
 * Same record and same coach queue as the administration's request
 * (`RequestWorkoutChange`), with `requestedBy` = the athlete, so the coach's
 * dashboard shows who asked. The request never edits the prescription. It
 * needs a responsible coach and a school: the change-request record is
 * school-scoped, so independent coaching uses comments instead.
 */
export class RequestWorkoutChangeAsAthlete {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, assignmentId: string, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = requestWorkoutChangeAsAthleteSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const { role, assignment } = await resolveWorkoutAssignmentParticipant(tx, actor.data, assignmentId);
        if (role !== "athlete") throw new SchoolError("FORBIDDEN", "Só o atleta pede alteração do próprio treino.", 403);
        if (!assignment.coachId) {
          throw new SchoolError("WORKOUT_CHANGE_REQUEST_NO_COACH", "Este treino não tem professor responsável para solicitar alteração.", 409);
        }
        if (!assignment.schoolId) {
          throw new SchoolError("WORKOUT_CHANGE_REQUEST_NO_SCHOOL", "Fora de uma escola, fale com o professor pelos comentários do treino.", 409);
        }

        const open = await tx.workoutChangeRequest.findFirst({
          where: {
            workoutAssignmentId: assignment.id,
            status: { in: [WorkoutChangeRequestStatus.PENDING, WorkoutChangeRequestStatus.ACKNOWLEDGED] },
          },
          select: { id: true },
        });
        if (open) {
          throw new SchoolError("WORKOUT_CHANGE_REQUEST_ALREADY_OPEN", "Já existe uma solicitação de alteração aberta para este treino.", 409);
        }

        const now = this.clock();
        const saved = await tx.workoutChangeRequest.create({
          data: createWorkoutChangeRequest({
            id: randomUUID(),
            schoolId: assignment.schoolId,
            workoutAssignmentId: assignment.id,
            coachId: assignment.coachId,
            requestedBy: actor.data,
            reason: input.reason,
          }, now),
        });

        await new AuditService(tx).log({
          schoolId: assignment.schoolId,
          actorUserId: actor.data,
          action: AuditAction.WORKOUT_CHANGE_REQUESTED,
          entityType: AuditEntityType.WORKOUT_CHANGE_REQUEST,
          entityId: saved.id,
          metadata: { workoutAssignmentId: assignment.id, coachId: assignment.coachId, requestedByRole: "athlete" },
        });

        return saved;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_CHANGE_REQUEST_CONFLICT", "A solicitação foi alterada. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
