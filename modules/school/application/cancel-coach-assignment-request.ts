import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * The athlete withdraws a request the coach has not answered yet (SAM-25).
 *
 * Only the athlete who asked, only while PENDING. The period closes as
 * REJECTED (the only closing transition a PENDING row has), with the athlete
 * as actor so the history says who closed it. The COACH history grant given
 * with the request is revoked unless another open link with the same coach
 * still needs it.
 */
export class CancelCoachAssignmentRequest {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, coachId: string, assignmentId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(coachId).success || !id.safeParse(assignmentId).success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const assignments = new CoachAthleteAssignmentRepository(tx);
        const assignment = await assignments.findById(assignmentId);
        // Another athlete's request, or one addressed to another coach, is
        // invisible from this URL: a 404, never a 403 that confirms it exists.
        if (!assignment || assignment.athleteId !== actor.data || assignment.coachId !== coachId) throw this.notFound();
        if (assignment.status !== "PENDING") {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Este pedido já foi respondido.", 409);
        }

        const now = this.clock();
        const closed = await assignments.updateStatus(assignment.id, "REJECTED", now, actor.data);
        if (!closed) throw this.notFound();

        const stillLinked = await tx.coachAthleteAssignment.findFirst({
          where: { athleteId: actor.data, coachId, status: { in: ["PENDING", "ACTIVE"] } },
          select: { id: true },
        });
        if (!stillLinked) {
          await tx.historyAccessGrant.updateMany({
            where: { athleteId: actor.data, coachId, granteeType: "COACH", status: "ACTIVE" },
            data: { status: "REVOKED", revokedBy: actor.data, revokedAt: now, updatedAt: now },
          });
        }

        if (assignment.schoolId) {
          await new AuditService(tx).log({
            schoolId: assignment.schoolId,
            actorUserId: actor.data,
            action: AuditAction.COACH_ASSIGNMENT_REQUEST_CANCELLED,
            entityType: AuditEntityType.ASSIGNMENT,
            entityId: assignment.id,
            metadata: { athleteId: actor.data, coachId },
          });
        }

        return closed;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "O pedido foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Pedido não encontrado.", 404);
  }
}
