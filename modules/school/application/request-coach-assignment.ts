import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HistoryGranteeType } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createCoachAthleteAssignment } from "../domain/coach-athlete-assignment";
import { createHistoryAccessGrant, FULL_HISTORY_GRANT_SCOPE } from "../domain/history-access-grant";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * What the athlete chooses when asking a coach to follow them (SAM-25).
 * `schoolId` null = independent coaching; set = within a school both belong to.
 */
export const requestCoachAssignmentSchema = z.strictObject({
  schoolId: id.nullish().transform((value) => value ?? null),
  shareHistory: z.boolean().default(true),
  note: z.string().trim().min(1).max(500).nullish().transform((value) => value ?? null),
});
export type RequestCoachAssignmentInput = z.input<typeof requestCoachAssignmentSchema>;

/**
 * Athlete-initiated request to be coached. Mirrors the invitation path (the
 * only way a PENDING assignment existed before): the coach decides later.
 *
 * One serializable transaction validates everything, then creates the PENDING
 * primary assignment and, when asked, the full-scope COACH history grant — the
 * athlete's own consent (ADR-005). Inside a school, both parties must be active
 * there and the athlete must have no open primary coach; independently, the
 * pair must have no open request or link.
 */
export class RequestCoachAssignment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, coachId: string, raw: unknown = {}) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(coachId);
    if (!target.success) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
    const input = requestCoachAssignmentSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { id: target.data }, select: { id: true, userId: true, status: true },
        });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
        if (coach.userId === actor.data) {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_SELF", "Você não pode solicitar acompanhamento a si mesmo.", 409);
        }

        if (input.schoolId) {
          const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, status: true } });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
          if (!await new SchoolAthleteMembershipRepository(tx).findActiveBySchoolAndAthlete(school.id, actor.data)) {
            throw new SchoolError("ATHLETE_NOT_MEMBER", "Você não é membro ativo desta escola.", 403);
          }
          const coachLink = await new CoachSchoolMembershipRepository(tx).findActiveBySchoolAndCoach(school.id, coach.id);
          if (!coachLink) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 409);
          }
          if (coachLink.suspendedAt) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_SUSPENDED", "O professor está desativado e não pode receber novos alunos.", 409);
          }
          const openPrimary = await tx.coachAthleteAssignment.findFirst({
            where: { athleteId: actor.data, schoolId: school.id, isPrimary: true, status: { in: ["PENDING", "ACTIVE"] } },
            select: { id: true },
          });
          if (openPrimary) {
            throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Você já tem professor principal (ou um pedido aberto) nesta escola.", 409);
          }
        } else {
          const openPair = await tx.coachAthleteAssignment.findFirst({
            where: { athleteId: actor.data, coachId: coach.id, schoolId: null, status: { in: ["PENDING", "ACTIVE"] } },
            select: { id: true },
          });
          if (openPair) {
            throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Já existe um pedido ou acompanhamento aberto com este professor.", 409);
          }
        }

        const now = this.clock();
        const assignment = await new CoachAthleteAssignmentRepository(tx).create(createCoachAthleteAssignment({
          id: randomUUID(), athleteId: actor.data, coachId: coach.id, schoolId: input.schoolId,
          isPrimary: true, sportType: null, reason: input.note,
        }, now));

        let grantId: string | null = null;
        if (input.shareHistory) {
          const existing = await tx.historyAccessGrant.findFirst({
            where: { athleteId: actor.data, coachId: coach.id, granteeType: HistoryGranteeType.COACH, status: "ACTIVE" },
            select: { id: true },
          });
          if (existing) {
            grantId = existing.id;
          } else {
            const grant = createHistoryAccessGrant({
              id: randomUUID(), athleteId: actor.data, grantedBy: actor.data,
              granteeType: HistoryGranteeType.COACH, granteeId: coach.id, coachId: coach.id, schoolId: null,
              scope: FULL_HISTORY_GRANT_SCOPE, fromDate: null, toDate: null,
            }, now);
            await tx.historyAccessGrant.create({ data: grant });
            grantId = grant.id;
          }
        }

        if (input.schoolId) {
          await new AuditService(tx).log({
            schoolId: input.schoolId,
            actorUserId: actor.data,
            action: AuditAction.COACH_ASSIGNMENT_REQUESTED,
            entityType: AuditEntityType.ASSIGNMENT,
            entityId: assignment.id,
            metadata: { athleteId: actor.data, coachId: coach.id, shareHistory: input.shareHistory, grantId },
          });
        }

        return assignment;
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
