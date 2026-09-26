import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutChangeRequestStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkoutChangeRequest } from "../domain/workout-change-request";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const requestWorkoutChangeSchema = z.strictObject({
  workoutAssignmentId: idSchema,
  reason: z.string().trim().min(1).max(2000),
});

/**
 * School administration asks the coach who authored a prescription to revise it.
 *
 * This records a request; it does not touch the WorkoutAssignment. Editing the
 * prescription stays with the coach, so administration cannot silently rewrite
 * someone else's professional decision.
 */
export class RequestWorkoutChange {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    const input = requestWorkoutChangeSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolId }, select: { id: true, status: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const assignment = await tx.workoutAssignment.findUnique({
          where: { id: input.workoutAssignmentId },
          select: { id: true, schoolId: true, coachId: true },
        });
        // An assignment from another school must not be reachable through this
        // school's URL, and one without a coach has nobody to answer the request.
        if (!assignment || assignment.schoolId !== school.id) {
          throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Prescrição não encontrada.", 404);
        }
        if (!assignment.coachId) {
          throw new SchoolError(
            "WORKOUT_CHANGE_REQUEST_NO_COACH",
            "Esta prescrição não tem professor responsável para solicitar alteração.",
            409,
          );
        }

        const open = await tx.workoutChangeRequest.findFirst({
          where: {
            workoutAssignmentId: assignment.id,
            status: { in: [WorkoutChangeRequestStatus.PENDING, WorkoutChangeRequestStatus.ACKNOWLEDGED] },
          },
          select: { id: true },
        });
        if (open) {
          throw new SchoolError(
            "WORKOUT_CHANGE_REQUEST_ALREADY_OPEN",
            "Já existe uma solicitação de alteração aberta para esta prescrição.",
            409,
          );
        }

        const now = this.clock();
        const saved = await tx.workoutChangeRequest.create({
          data: createWorkoutChangeRequest({
            id: randomUUID(),
            schoolId: school.id,
            workoutAssignmentId: assignment.id,
            coachId: assignment.coachId,
            requestedBy: actor.data,
            reason: input.reason,
          }, now),
        });

        await new AuditService(tx).log({
          schoolId: school.id,
          actorUserId: actor.data,
          action: AuditAction.WORKOUT_CHANGE_REQUESTED,
          entityType: AuditEntityType.WORKOUT_CHANGE_REQUEST,
          entityId: saved.id,
          metadata: { workoutAssignmentId: assignment.id, coachId: assignment.coachId },
        });

        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError(
          "WORKOUT_CHANGE_REQUEST_CONFLICT",
          "A solicitação foi alterada. Atualize e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }
}
