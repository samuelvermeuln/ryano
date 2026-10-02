/**
 * SAM-30 — the athlete confirms a coach's proposal to continue independently.
 *
 * The proposal is the PENDING independent assignment the coach opened with
 * `reason = moved_from_school`. Confirming, in one serializable transaction:
 * the proposal becomes ACTIVE (the partial unique index of migration 0056
 * refuses a second ACTIVE independent link of the pair), every ACTIVE link of
 * the pair inside a school ENDs, each such school is audited and its managers
 * are told, and the coach learns where the athlete now lives in their hub.
 *
 * The athlete's school membership is untouched: they stay in the school, now
 * without a responsible coach there (ADR-003 lobby). History grants are
 * untouched as well (ADR-005: consent is the athlete's and separate).
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MOVED_FROM_SCHOOL_REASON } from "../domain/coach-athlete-assignment";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class ConfirmTransferToIndependent {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, coachId: string, assignmentId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(coachId).success || !id.safeParse(assignmentId).success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const assignments = new CoachAthleteAssignmentRepository(tx);
        const proposal = await assignments.findById(assignmentId);
        // Someone else's row, or a row of another coach, is simply not found.
        if (!proposal || proposal.athleteId !== actor.data || proposal.coachId !== coachId || proposal.schoolId !== null) {
          throw this.notFound();
        }
        if (proposal.reason !== MOVED_FROM_SCHOOL_REASON) {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Este pedido não é uma proposta de transferência.", 409);
        }
        if (proposal.status !== "PENDING") {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Esta proposta já foi respondida.", 409);
        }

        const coach = await tx.coachProfile.findUnique({
          where: { id: coachId },
          select: { id: true, userId: true, status: true, displayName: true, acceptsIndependentAthletes: true },
        });
        if (!coach || coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
        if (coach.acceptsIndependentAthletes === false) {
          throw new SchoolError("COACH_NOT_ACCEPTING_INDEPENDENT", "Este professor não atende mais fora de uma escola.", 409);
        }

        const now = this.clock();
        const activated = await assignments.updateStatus(proposal.id, "ACTIVE", now, actor.data);
        if (!activated) throw this.notFound();

        // Close the pair's school links (symmetric to SAM-29, which closes every
        // other link when the athlete follows the coach into a school).
        const schoolLinks = await tx.coachAthleteAssignment.findMany({
          where: { athleteId: actor.data, coachId: coach.id, schoolId: { not: null }, status: "ACTIVE" },
          select: { id: true, schoolId: true },
        });
        const notifications = new NotificationService(tx, () => now);
        const athlete = await tx.user.findUnique({ where: { id: actor.data }, select: { name: true } });
        const athleteName = athlete?.name ?? "Um atleta";
        const coachName = coach.displayName ?? "o professor";

        for (const link of schoolLinks) {
          const ended = await assignments.updateStatus(link.id, "ENDED", now, actor.data);
          if (!ended) throw this.notFound();
          const schoolId = link.schoolId!;
          await new AuditService(tx).log({
            schoolId,
            actorUserId: actor.data,
            action: AuditAction.ATHLETE_TRANSFER_CONFIRMED,
            entityType: AuditEntityType.ASSIGNMENT,
            entityId: link.id,
            metadata: { athleteId: actor.data, coachId: coach.id, independentAssignmentId: proposal.id },
          });
          const [school, managers] = await Promise.all([
            tx.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
            tx.schoolMembership.findMany({
              where: { schoolId, status: "ACTIVE", roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
              select: { userId: true },
            }),
          ]);
          await notifications.notifyMany(managers.map((row) => row.userId), {
            kind: UserNotificationKind.COACH_TRANSFER_CONFIRMED,
            title: `${athleteName} passou a treinar com ${coachName} fora da ${school?.name ?? "escola"}`,
            body: "O atleta continua membro da escola, agora sem professor responsável. Atribua outro professor em Atletas, se quiser.",
            href: `/escola/${schoolId}/atletas`,
            payload: { athleteId: actor.data, coachId: coach.id, endedAssignmentId: link.id },
          });
        }

        await notifications.notify({
          userId: coach.userId,
          kind: UserNotificationKind.COACH_TRANSFER_CONFIRMED,
          title: `${athleteName} confirmou continuar com você de forma independente`,
          body: "O acompanhamento agora vive na sua central de coach independente.",
          href: `/professor/independente/atletas/${actor.data}`,
          payload: { athleteId: actor.data, assignmentId: proposal.id, endedSchoolAssignmentIds: schoolLinks.map((link) => link.id) },
        });

        return activated;
      // Several round trips against a remote database do not fit Prisma's 5s default.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Os vínculos foram alterados. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Proposta não encontrada.", 404);
  }
}
