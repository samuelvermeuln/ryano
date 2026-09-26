import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutChangeRequestStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import {
  transitionWorkoutChangeRequest,
  workoutChangeRequestSchema,
} from "../domain/workout-change-request";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const decideWorkoutChangeSchema = z.strictObject({
  status: z.enum([
    WorkoutChangeRequestStatus.ACKNOWLEDGED,
    WorkoutChangeRequestStatus.RESOLVED,
    WorkoutChangeRequestStatus.DECLINED,
    WorkoutChangeRequestStatus.CANCELLED,
  ]),
  resolutionNote: z.string().trim().max(2000).nullish().transform((value) => value ?? null),
});

const AUDIT_BY_STATUS = {
  [WorkoutChangeRequestStatus.ACKNOWLEDGED]: AuditAction.WORKOUT_CHANGE_ACKNOWLEDGED,
  [WorkoutChangeRequestStatus.RESOLVED]: AuditAction.WORKOUT_CHANGE_RESOLVED,
  [WorkoutChangeRequestStatus.DECLINED]: AuditAction.WORKOUT_CHANGE_DECLINED,
  [WorkoutChangeRequestStatus.CANCELLED]: AuditAction.WORKOUT_CHANGE_CANCELLED,
} as const;

/**
 * Moves an open change request forward.
 *
 * Who may do what is split on purpose: the coach owns the professional answer
 * (acknowledge / resolve / decline), while school administration may only
 * withdraw a request it opened. That keeps administration from marking its own
 * request "resolved" without the coach ever touching the prescription.
 */
export class DecideWorkoutChange {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, requestId: string, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(requestId).success) throw this.notFound();
    const input = decideWorkoutChangeSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolId }, select: { id: true, status: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const stored = await tx.workoutChangeRequest.findUnique({ where: { id: requestId } });
        if (!stored || stored.schoolId !== school.id) throw this.notFound();

        const coach = await tx.coachProfile.findUnique({
          where: { id: stored.coachId }, select: { userId: true },
        });
        const isCoach = coach?.userId === actor.data;
        if (input.status === WorkoutChangeRequestStatus.CANCELLED) {
          // Withdrawing is an administrative act; the coach declines instead.
          await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
        } else if (!isCoach) {
          throw new SchoolError(
            "FORBIDDEN",
            "Somente o professor responsável pode responder a esta solicitação.",
            403,
          );
        }

        const current = workoutChangeRequestSchema.parse(stored);
        const now = this.clock();
        let next;
        try {
          next = transitionWorkoutChangeRequest(current, input.status, actor.data, now, input.resolutionNote);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("WORKOUT_CHANGE_REQUEST_")) {
            throw new SchoolError(
              "WORKOUT_CHANGE_REQUEST_NOT_OPEN",
              "Esta solicitação já foi encerrada.",
              409,
            );
          }
          throw error;
        }

        const saved = await tx.workoutChangeRequest.update({
          // Fail with P2025 if another writer decided this request after the read.
          where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
          data: {
            status: next.status,
            resolvedBy: next.resolvedBy,
            resolvedAt: next.resolvedAt,
            resolutionNote: next.resolutionNote,
            updatedAt: next.updatedAt,
          },
        });

        await new AuditService(tx).log({
          schoolId: school.id,
          actorUserId: actor.data,
          action: AUDIT_BY_STATUS[input.status],
          entityType: AuditEntityType.WORKOUT_CHANGE_REQUEST,
          entityId: saved.id,
          metadata: { workoutAssignmentId: saved.workoutAssignmentId, coachId: saved.coachId },
        });

        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError(
          "WORKOUT_CHANGE_REQUEST_CONFLICT",
          "A solicitação foi alterada. Atualize e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("WORKOUT_CHANGE_REQUEST_NOT_FOUND", "Solicitação não encontrada.", 404);
  }
}
