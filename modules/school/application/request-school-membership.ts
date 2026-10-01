import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HistoryGranteeType } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createCoachAthleteAssignment } from "../domain/coach-athlete-assignment";
import { createHistoryAccessGrant, FULL_HISTORY_GRANT_SCOPE } from "../domain/history-access-grant";
import { createSchoolAthleteMembership } from "../domain/school-athlete-membership";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Options the athlete chooses while asking to join (SAM-24). Both are theirs to
 * decide: sharing the history is consent (ADR-005), and the preferred coach is a
 * wish the school honours or not when it approves.
 */
export const requestSchoolMembershipSchema = z.strictObject({
  shareHistory: z.boolean().default(true),
  preferredCoachId: id.nullish().transform((value) => value ?? null),
});
export type RequestSchoolMembershipInput = z.input<typeof requestSchoolMembershipSchema>;

/**
 * Self-serve request to join a school from the public discovery screen.
 *
 * One serializable transaction creates the PENDING membership and, when asked,
 * the full-scope SCHOOL history grant and a PENDING primary assignment to the
 * preferred coach. Validation runs before any write so a refused coach leaves
 * no half request behind. A second request while one is already PENDING is a
 * conflict — the school decides once.
 */
export class RequestSchoolMembership {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown = {}) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(schoolId);
    if (!target.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const input = requestSchoolMembershipSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: target.data }, select: { id: true, status: true, joinPolicy: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        if (school.joinPolicy === "INVITE_ONLY") {
          throw new SchoolError("SCHOOL_INVITE_ONLY", "Esta escola aceita atletas apenas por convite.", 409);
        }

        const memberships = new SchoolAthleteMembershipRepository(tx);
        if (await memberships.findActiveBySchoolAndAthlete(school.id, actor.data)) {
          throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE", "Você já possui vínculo ativo com esta escola.", 409);
        }
        if (await memberships.findPendingBySchoolAndAthlete(school.id, actor.data)) {
          throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING", "Você já tem um pedido aguardando aprovação nesta escola.", 409);
        }

        const now = this.clock();

        // The athlete is not a member here (checked above), so any coach
        // assignment still ACTIVE at this school is a leftover from a membership
        // that ended before assignments were coordinated with it (SAM-26). Close
        // it as history instead of letting it block the new request.
        const stale = await tx.coachAthleteAssignment.findMany({
          where: { athleteId: actor.data, schoolId: school.id, status: "ACTIVE" },
          select: { id: true },
        });
        const assignments = new CoachAthleteAssignmentRepository(tx);
        for (const row of stale) await assignments.updateStatus(row.id, "ENDED", now, actor.data);

        // Validate the preferred coach before writing the request: a refused
        // wish must not leave a membership request behind.
        if (input.preferredCoachId) {
          const coachLink = await new CoachSchoolMembershipRepository(tx).findActiveBySchoolAndCoach(school.id, input.preferredCoachId);
          if (!coachLink) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 409);
          }
          if (coachLink.suspendedAt) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_SUSPENDED", "O professor está desativado e não pode receber novos alunos.", 409);
          }
          const open = await tx.coachAthleteAssignment.findFirst({
            where: { athleteId: actor.data, schoolId: school.id, isPrimary: true, status: "PENDING" },
            select: { id: true },
          });
          if (open) {
            throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Já existe um pedido de professor aberto nesta escola.", 409);
          }
        }

        const membership = await memberships.create(createSchoolAthleteMembership({
          id: randomUUID(), athleteId: actor.data, schoolId: school.id, joinSource: "MANUAL_SEARCH",
        }, now));

        let assignmentId: string | null = null;
        if (input.preferredCoachId) {
          const pending = await assignments.create(createCoachAthleteAssignment({
            id: randomUUID(), athleteId: actor.data, coachId: input.preferredCoachId,
            schoolId: school.id, isPrimary: true, sportType: null,
          }, now));
          assignmentId = pending.id;
        }

        let grantId: string | null = null;
        if (input.shareHistory) {
          const existing = await tx.historyAccessGrant.findFirst({
            where: { athleteId: actor.data, schoolId: school.id, granteeType: HistoryGranteeType.SCHOOL, status: "ACTIVE" },
            select: { id: true },
          });
          if (existing) {
            grantId = existing.id;
          } else {
            const grant = createHistoryAccessGrant({
              id: randomUUID(), athleteId: actor.data, grantedBy: actor.data,
              granteeType: HistoryGranteeType.SCHOOL, granteeId: school.id, schoolId: school.id, coachId: null,
              scope: FULL_HISTORY_GRANT_SCOPE, fromDate: null, toDate: null,
            }, now);
            await tx.historyAccessGrant.create({ data: grant });
            grantId = grant.id;
          }
        }

        await new AuditService(tx).log({
          schoolId: school.id,
          actorUserId: actor.data,
          action: AuditAction.ATHLETE_MEMBERSHIP_REQUESTED,
          entityType: AuditEntityType.ATHLETE_MEMBERSHIP,
          entityId: membership.id,
          metadata: {
            athleteId: actor.data,
            joinSource: "MANUAL_SEARCH",
            shareHistory: input.shareHistory,
            preferredCoachId: input.preferredCoachId,
            grantId,
            assignmentId,
          },
        });

        return membership;
      // A dozen round trips against a remote database do not fit Prisma's 5s
      // default; the window is widened, not the isolation.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", "Os vínculos foram alterados. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
