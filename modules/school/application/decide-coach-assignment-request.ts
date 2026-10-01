import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export type CoachAssignmentDecision = "accept" | "reject";

/**
 * The coach answers an athlete's request to be followed (SAM-26).
 *
 * Identity comes from the session: only the owner of the `CoachProfile` the
 * request was addressed to can decide, and a request addressed to someone else
 * is a 404 from this coach's point of view. Accepting a school-scoped request
 * also requires the athlete to already be an ACTIVE member there — until the
 * school approves the athlete, the coach can only wait — and the coach to be
 * active and not suspended at that school. Rejecting revokes the COACH history
 * grant the athlete attached, unless another open link still needs it.
 */
export class DecideCoachAssignmentRequest {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, assignmentId: string, decision: CoachAssignmentDecision) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(assignmentId).success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { userId: actor.data }, select: { id: true, userId: true, status: true, displayName: true },
        });
        if (!coach) throw new SchoolError("FORBIDDEN", "Apenas um professor pode responder a este pedido.", 403);
        const coachName = coach.displayName ?? "Seu professor";

        const assignments = new CoachAthleteAssignmentRepository(tx);
        const assignment = await assignments.findById(assignmentId);
        if (!assignment || assignment.coachId !== coach.id) throw this.notFound();
        if (assignment.status !== "PENDING") {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Este pedido já foi respondido.", 409);
        }

        const now = this.clock();

        if (decision === "accept") {
          if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
          if (assignment.schoolId) {
            const link = await new CoachSchoolMembershipRepository(tx).findActiveBySchoolAndCoach(assignment.schoolId, coach.id);
            if (!link) {
              throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "Você não possui vínculo ativo com esta escola.", 409);
            }
            if (link.suspendedAt) {
              throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_SUSPENDED", "Seu vínculo com a escola está desativado e não pode receber novos alunos.", 409);
            }
            const athleteLink = await new SchoolAthleteMembershipRepository(tx).findActiveBySchoolAndAthlete(assignment.schoolId, assignment.athleteId);
            if (!athleteLink) {
              throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_NOT_ACTIVE", "Aguarde a escola aprovar o vínculo do atleta antes de aceitar.", 409);
            }
            if (assignment.isPrimary && await assignments.findActivePrimaryBySchoolAndAthlete(assignment.schoolId, assignment.athleteId)) {
              throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "O atleta já tem professor principal nesta escola.", 409);
            }
          }
          const accepted = await assignments.updateStatus(assignment.id, "ACTIVE", now, coach.userId);
          if (!accepted) throw this.notFound();
          await this.audit(tx, assignment.schoolId, coach.userId, AuditAction.COACH_ASSIGNMENT_ACCEPTED, assignment.id, { athleteId: assignment.athleteId, coachId: coach.id });
          // SAM-29 — the athlete learns the answer; the link opens where their training now lives.
          await new NotificationService(tx, () => now).notify({
            userId: assignment.athleteId,
            kind: UserNotificationKind.COACH_REQUEST_ACCEPTED,
            title: `${coachName} aceitou acompanhar você`,
            body: assignment.schoolId
              ? "Seu pedido foi aceito. Os próximos treinos dele aparecem no painel da escola."
              : "Seu pedido foi aceito. Os próximos treinos dele aparecem em Meus treinos.",
            href: assignment.schoolId ? `/atleta/${assignment.schoolId}` : "/app/treinos",
            payload: { assignmentId: assignment.id, coachId: coach.id, schoolId: assignment.schoolId },
          });
          return accepted;
        }

        const rejected = await assignments.updateStatus(assignment.id, "REJECTED", now, coach.userId);
        if (!rejected) throw this.notFound();
        const stillLinked = await tx.coachAthleteAssignment.findFirst({
          where: { athleteId: assignment.athleteId, coachId: coach.id, status: { in: ["PENDING", "ACTIVE"] } },
          select: { id: true },
        });
        if (!stillLinked) {
          await tx.historyAccessGrant.updateMany({
            where: { athleteId: assignment.athleteId, coachId: coach.id, granteeType: "COACH", status: "ACTIVE" },
            data: { status: "REVOKED", revokedBy: coach.userId, revokedAt: now, updatedAt: now },
          });
        }
        await this.audit(tx, assignment.schoolId, coach.userId, AuditAction.COACH_ASSIGNMENT_REJECTED, assignment.id, { athleteId: assignment.athleteId, coachId: coach.id });
        await new NotificationService(tx, () => now).notify({
          userId: assignment.athleteId,
          kind: UserNotificationKind.COACH_REQUEST_REJECTED,
          title: `${coachName} não pôde aceitar seu pedido`,
          body: "O professor recusou o acompanhamento. Você pode procurar outro professor em Encontrar professor.",
          href: "/app/professor",
          payload: { assignmentId: assignment.id, coachId: coach.id, schoolId: assignment.schoolId },
        });
        return rejected;
      // Several round trips against a remote database do not fit Prisma's 5s default.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "O pedido foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    schoolId: string | null,
    actorUserId: string,
    action: AuditAction,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    // Independent requests have no school log to write to.
    if (!schoolId) return;
    await new AuditService(tx).log({ schoolId, actorUserId, action, entityType: AuditEntityType.ASSIGNMENT, entityId, metadata });
  }

  private notFound() {
    return new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Pedido não encontrado.", 404);
  }
}
