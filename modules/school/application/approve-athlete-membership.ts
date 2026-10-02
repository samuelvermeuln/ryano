import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { schoolLogger } from "../infrastructure/logger";
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";
import { assignCoachToAthleteInTransaction } from "./assign-coach-to-athlete";
import { CanManageMembers } from "./can-manage-members";
import { endOtherCoachingLinksOfPair } from "./end-other-coaching-links";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** SAM-29 — `reason` a PENDING preferred-coach assignment carries when the athlete is following the coach to a new school. */
export const MOVED_WITH_COACH_REASON = "moved_with_coach";

/**
 * SAM-26 — the school may name the athlete's coach while approving. `null`
 * leaves any preferred-coach request PENDING for the coach to answer.
 */
export const approveAthleteMembershipSchema = z.strictObject({
  coachId: idSchema.nullish().transform((value) => value ?? null),
});
export type ApproveAthleteMembershipInput = z.input<typeof approveAthleteMembershipSchema>;

export class ApproveAthleteMembership {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string, raw: unknown = {}) {
    const log = schoolLogger("approve-athlete-membership");
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const membershipTarget = idSchema.safeParse(membershipId);
    if (!membershipTarget.success) throw this.notFound();
    const input = approveAthleteMembershipSchema.parse(raw);

    log.info("membership_approve_start", { actorUserId, schoolId, membershipId, correlationId: log.correlationId });

    try {
      const result = await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolTarget.data }, select: { id: true, status: true, name: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const memberships = new SchoolAthleteMembershipRepository(tx);
        const membership = await memberships.findById(membershipTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();
        const now = this.clock();
        const approved = await memberships.updateStatus(membership.id, "ACTIVE", now, actor.data);
        if (!approved) throw this.notFound();

        // SAM-26 — the coach the athlete asked for when joining, if any.
        const assignments = new CoachAthleteAssignmentRepository(tx);
        const preferred = await tx.coachAthleteAssignment.findFirst({
          where: { athleteId: membership.athleteId, schoolId: school.id, status: "PENDING", isPrimary: true },
          select: { id: true, coachId: true, reason: true },
        });

        if (input.coachId) {
          if (preferred && preferred.coachId === input.coachId) {
            // The school confirms the athlete's wish; the coach must still be eligible now.
            const link = await new CoachSchoolMembershipRepository(tx).findActiveBySchoolAndCoach(school.id, input.coachId);
            if (!link) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 409);
            if (link.suspendedAt) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_SUSPENDED", "O professor está desativado e não pode receber novos alunos.", 409);
            if (!await assignments.updateStatus(preferred.id, "ACTIVE", now, actor.data)) throw this.notFound();
            // SAM-29 — "seguir professor": the athlete asked to move with this
            // coach, so the previous link with them (independent or at another
            // school) closes now that the new one is active. Only when asked.
            if (preferred.reason === MOVED_WITH_COACH_REASON) {
              await endOtherCoachingLinksOfPair(tx, {
                athleteId: membership.athleteId, coachId: input.coachId, keepSchoolId: school.id, now, endedBy: membership.athleteId,
              });
            }
          } else {
            // Another coach was chosen: the athlete's wish closes, the school's choice opens.
            if (preferred && !await assignments.updateStatus(preferred.id, "REJECTED", now, actor.data)) throw this.notFound();
            await assignCoachToAthleteInTransaction(tx, actor.data, school.id, membership.athleteId, input.coachId, now);
          }
        }

        // SAM-29 — the athlete learns they are in, with a link to the school panel.
        await new NotificationService(tx, () => now).notify({
          userId: membership.athleteId,
          kind: UserNotificationKind.SCHOOL_REQUEST_APPROVED,
          title: `Você entrou na ${school.name ?? "escola"}`,
          body: input.coachId
            ? "Seu pedido foi aprovado e a escola já definiu seu professor. Seus treinos aparecem no painel da escola."
            : "Seu pedido foi aprovado. Seus treinos aparecem no painel da escola.",
          href: `/atleta/${school.id}`,
          payload: { schoolId: school.id, membershipId: membership.id, coachId: input.coachId },
        });

        return approved;
      // Assigning the coach adds several round trips; a remote database does not fit Prisma's 5s default.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
      log.info("membership_approved", { membershipId: result.id, schoolId, correlationId: log.correlationId });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2025", "P2034"].includes(error.code)) {
        log.warn("membership_approve_conflict", { membershipId, correlationId: log.correlationId });
        throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", "O vínculo do atleta foi alterado. Atualize e tente novamente.", 409);
      }
      if (error instanceof SchoolError) log.warn("membership_approve_error", { code: error.code, correlationId: log.correlationId });
      else log.error("membership_approve_unexpected", { error: String(error), correlationId: log.correlationId });
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", "Vínculo do atleta não encontrado.", 404);
  }
}
