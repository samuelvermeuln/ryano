/**
 * SAM-30 — a coach proposes moving an athlete they already coach between
 * independent coaching and a school. The coach never moves anyone alone: the
 * athlete confirms, and a school still approves who enters it.
 *
 * - `to-school`: the pair's ACTIVE link is independent; the target school is
 *   one the coach is active in. Nothing is persisted: the athlete gets the
 *   SAM-29 "follow the coach" link (`/app/escola?school=&coach=`), whose modal
 *   creates the membership request + the PENDING assignment with
 *   `reason = moved_with_coach`; approving it (by the school, or by the coach's
 *   own acceptance) ends the independent link.
 * - `to-independent`: the pair's ACTIVE link is at that school. The proposal IS
 *   a PENDING independent assignment the coach opens with
 *   `reason = moved_from_school`; the athlete confirms it
 *   (`ConfirmTransferToIndependent`) or declines it (the existing cancel
 *   route). The coach cannot accept their own proposal
 *   (`DecideCoachAssignmentRequest` refuses that reason).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createCoachAthleteAssignment, MOVED_FROM_SCHOOL_REASON } from "../domain/coach-athlete-assignment";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const proposeAthleteTransferSchema = z.discriminatedUnion("kind", [
  /** Independent → school: `schoolId` is the TARGET school. */
  z.strictObject({ kind: z.literal("to-school"), athleteId: id, schoolId: id }),
  /** School → independent: `schoolId` is the SOURCE school (where the pair's link lives). */
  z.strictObject({ kind: z.literal("to-independent"), athleteId: id, schoolId: id }),
]);
export type ProposeAthleteTransferInput = z.input<typeof proposeAthleteTransferSchema>;

export type ProposeAthleteTransferResult =
  | { target: "school"; schoolId: string }
  | { target: "independent"; assignmentId: string };

export class ProposeAthleteTransfer {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<ProposeAthleteTransferResult> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = proposeAthleteTransferSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { userId: actor.data },
          select: { id: true, userId: true, status: true, displayName: true, acceptsIndependentAthletes: true },
        });
        if (!coach) throw new SchoolError("FORBIDDEN", "Apenas um professor pode propor uma transferência.", 403);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
        const coachName = coach.displayName ?? "Seu professor";

        const school = await tx.school.findUnique({
          where: { id: input.schoolId },
          select: { id: true, name: true, status: true, joinPolicy: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        const now = this.clock();
        const notifications = new NotificationService(tx, () => now);

        if (input.kind === "to-school") {
          const link = await tx.coachAthleteAssignment.findFirst({
            where: { athleteId: input.athleteId, coachId: coach.id, schoolId: null, status: "ACTIVE", endedAt: null },
            select: { id: true },
          });
          if (!link) throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Você não acompanha este atleta de forma independente.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
          if (school.joinPolicy === "INVITE_ONLY") {
            throw new SchoolError("SCHOOL_INVITE_ONLY", "Esta escola só recebe atletas por convite.", 409);
          }
          const membership = await new CoachSchoolMembershipRepository(tx).findActiveBySchoolAndCoach(school.id, coach.id);
          if (!membership) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "Você não possui vínculo ativo com esta escola.", 409);
          if (membership.suspendedAt) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_SUSPENDED", "Seu vínculo com a escola está desativado.", 409);
          const athleteMembership = await tx.schoolAthleteMembership.findFirst({
            where: { schoolId: school.id, athleteId: input.athleteId, status: { in: ["ACTIVE", "PENDING"] } },
            select: { status: true },
          });
          if (athleteMembership?.status === "ACTIVE") {
            throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE", "O atleta já é membro desta escola.", 409);
          }
          if (athleteMembership?.status === "PENDING") {
            throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING", "O atleta já tem um pedido pendente nesta escola.", 409);
          }

          await notifications.notify({
            userId: input.athleteId,
            kind: UserNotificationKind.COACH_TRANSFER_PROPOSED,
            title: `${coachName} quer levar você para a ${school.name}`,
            body: "Confirme o pedido de vínculo com a escola, já com o professor indicado. Quando a escola aprovar, o acompanhamento continua lá.",
            href: `/app/escola?school=${school.id}&coach=${coach.id}`,
            payload: { target: "school", schoolId: school.id, coachId: coach.id, assignmentId: link.id },
          });
          await new AuditService(tx).log({
            schoolId: school.id,
            actorUserId: actor.data,
            action: AuditAction.ATHLETE_TRANSFER_PROPOSED,
            entityType: AuditEntityType.ASSIGNMENT,
            entityId: link.id,
            metadata: { athleteId: input.athleteId, coachId: coach.id, target: "school" },
          });
          return { target: "school", schoolId: school.id };
        }

        // to-independent
        if (coach.acceptsIndependentAthletes === false) {
          throw new SchoolError("COACH_NOT_ACCEPTING_INDEPENDENT", "Seu perfil não aceita atletas fora de uma escola.", 409);
        }
        const schoolLink = await tx.coachAthleteAssignment.findFirst({
          where: { athleteId: input.athleteId, coachId: coach.id, schoolId: school.id, status: "ACTIVE", endedAt: null },
          select: { id: true },
        });
        if (!schoolLink) throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Você não acompanha este atleta nesta escola.", 404);
        const openPair = await tx.coachAthleteAssignment.findFirst({
          where: { athleteId: input.athleteId, coachId: coach.id, schoolId: null, status: { in: ["PENDING", "ACTIVE"] } },
          select: { id: true },
        });
        if (openPair) {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Já existe um acompanhamento independente (ou uma proposta) com este atleta.", 409);
        }

        const proposal = await new CoachAthleteAssignmentRepository(tx).create(createCoachAthleteAssignment({
          id: randomUUID(), athleteId: input.athleteId, coachId: coach.id, schoolId: null,
          isPrimary: true, sportType: null, reason: MOVED_FROM_SCHOOL_REASON,
        }, now));

        await notifications.notify({
          userId: input.athleteId,
          kind: UserNotificationKind.COACH_TRANSFER_PROPOSED,
          title: `${coachName} propôs continuar seu acompanhamento fora da ${school.name}`,
          body: "Você continua na escola, sem professor responsável por lá. Confirme ou recuse em Professores.",
          href: `/app/professor?professor=${coach.id}`,
          payload: { target: "independent", assignmentId: proposal.id, schoolId: school.id, coachId: coach.id },
        });
        await new AuditService(tx).log({
          schoolId: school.id,
          actorUserId: actor.data,
          action: AuditAction.ATHLETE_TRANSFER_PROPOSED,
          entityType: AuditEntityType.ASSIGNMENT,
          entityId: proposal.id,
          metadata: { athleteId: input.athleteId, coachId: coach.id, target: "independent", schoolAssignmentId: schoolLink.id },
        });
        return { target: "independent", assignmentId: proposal.id };
      // Several round trips against a remote database do not fit Prisma's 5s default.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Os vínculos foram alterados. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
