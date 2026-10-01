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
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";
import { MOVED_WITH_COACH_REASON } from "./approve-athlete-membership";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Options the athlete chooses while asking to join (SAM-24). All theirs to
 * decide: sharing the history is consent (ADR-005), the preferred coach is a
 * wish the school honours or not when it approves, and `endPreviousCoaching`
 * (SAM-29, "seguir professor") asks that the previous link with that same coach
 * — independent or at another school — be closed once the school approves them
 * together. Never applied without the wish.
 */
export const requestSchoolMembershipSchema = z.strictObject({
  shareHistory: z.boolean().default(true),
  preferredCoachId: id.nullish().transform((value) => value ?? null),
  endPreviousCoaching: z.boolean().default(false),
}).refine((value) => !value.endPreviousCoaching || value.preferredCoachId !== null, {
  path: ["endPreviousCoaching"], message: "Encerrar o acompanhamento anterior exige um professor preferido.",
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
          where: { id: target.data }, select: { id: true, status: true, joinPolicy: true, name: true },
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
            ...(input.endPreviousCoaching ? { reason: MOVED_WITH_COACH_REASON } : {}),
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

        // SAM-29 — every manager of the school learns there is something to decide.
        const [managers, athlete] = await Promise.all([
          tx.schoolMembership.findMany({
            where: { schoolId: school.id, status: "ACTIVE", roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
            select: { userId: true },
          }),
          tx.user.findUnique({ where: { id: actor.data }, select: { name: true } }),
        ]);
        await new NotificationService(tx, () => now).notifyMany(managers.map((row) => row.userId), {
          kind: UserNotificationKind.NEW_SCHOOL_REQUEST,
          title: `${athlete?.name ?? "Um atleta"} pediu para entrar na ${school.name ?? "escola"}`,
          body: input.preferredCoachId ? "O atleta indicou um professor preferido. Aprove ou recuse em Solicitações." : "Aprove ou recuse em Solicitações.",
          href: `/escola/${school.id}/solicitacoes`,
          payload: { membershipId: membership.id, athleteId: actor.data, preferredCoachId: input.preferredCoachId },
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
