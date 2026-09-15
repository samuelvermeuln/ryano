import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment } from "../domain/coach-athlete-assignment";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "../domain/school-athlete-membership";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";
import { hashInvitationToken } from "../infrastructure/invitation-token";
import { ResolveInvitationLink, resolveInvitationLinkSchema } from "./resolve-invitation-link";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const acceptInvitationSchema = resolveInvitationLinkSchema;
const receiptSelect = { id: true, invitationId: true, result: true, usedAt: true } as const;

/** Accepts only for the session user. Membership, assignment, usage and receipt commit together. */
export class AcceptInvitation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = acceptInvitationSchema.parse(raw);
    try {
      return await this.db.$transaction(async (tx) => {
        const identity = await tx.invitationLink.findUnique({
          where: { tokenHash: hashInvitationToken(input.token) },
          select: { id: true, createdBy: true },
        });
        if (!identity) throw new SchoolError("INVITATION_NOT_FOUND", "Convite não encontrado.", 404);

        // Replay a committed receipt even after exhaustion/revocation. This never grants access
        // again or reopens a membership that was subsequently ended or rejected.
        const previous = await tx.invitationUse.findFirst({
          where: { invitationId: identity.id, userId: actor.data, athleteId: actor.data,
            result: { in: ["JOINED", "PENDING_APPROVAL"] } },
          orderBy: [{ usedAt: "asc" }, { id: "asc" }], select: receiptSelect,
        });
        if (previous) return previous;

        const now = this.clock();
        const invitation = await new ResolveInvitationLink(tx, () => now).execute(input);
        if (invitation.schoolId) {
          const school = await tx.school.findUnique({
            where: { id: invitation.schoolId }, select: { id: true, status: true },
          });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        }
        if (invitation.coachId) {
          const coach = await tx.coachProfile.findUnique({
            where: { id: invitation.coachId }, select: { id: true, status: true },
          });
          if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
          if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
          if (invitation.schoolId && !await tx.coachSchoolMembership.findFirst({
            where: { schoolId: invitation.schoolId, coachId: invitation.coachId, status: "ACTIVE", endedAt: null },
            select: { id: true },
          })) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 409);
          }
        }

        if (invitation.schoolId) {
          const existing = await tx.schoolAthleteMembership.findFirst({
            where: { schoolId: invitation.schoolId, athleteId: actor.data,
              status: { in: ["PENDING", "ACTIVE"] }, endedAt: null },
            select: { id: true, status: true },
          });
          // An existing active school member may accept a coach-specific invitation. A pending
          // request must follow its own approval flow, never be upgraded by another invitation.
          if (existing && (existing.status === "PENDING" || invitation.type === "SCHOOL")) {
            throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", "Você já possui um vínculo ativo ou pendente com esta escola.", 409);
          }
          if (!existing) {
            const pending = createSchoolAthleteMembership({
              id: randomUUID(), schoolId: invitation.schoolId, athleteId: actor.data,
              joinSource: invitation.type === "SCHOOL_COACH" ? "SCHOOL_COACH_INVITE" : "SCHOOL_INVITE",
            }, now);
            await new SchoolAthleteMembershipRepository(tx).create(invitation.requiresApproval
              ? pending : transitionSchoolAthleteMembership(pending, "ACTIVE", now, identity.createdBy));
          }
        }
        if (invitation.coachId) {
          const existing = await tx.coachAthleteAssignment.findFirst({
            where: {
              athleteId: actor.data, schoolId: invitation.schoolId,
              status: { in: ["PENDING", "ACTIVE"] }, endedAt: null,
              // School scope permits one primary coach; independent coaches are distinct pairs.
              ...(invitation.schoolId ? { isPrimary: true } : { coachId: invitation.coachId }),
            }, select: { id: true },
          });
          if (existing) throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Já existe vínculo ativo ou pendente com professor neste escopo.", 409);
          const pending = createCoachAthleteAssignment({
            id: randomUUID(), athleteId: actor.data, coachId: invitation.coachId,
            schoolId: invitation.schoolId, isPrimary: true, sportType: null,
          }, now);
          await new CoachAthleteAssignmentRepository(tx).create(invitation.requiresApproval
            ? pending : transitionCoachAthleteAssignment(pending, "ACTIVE", now, identity.createdBy));
        }

        // Compare-and-set also protects the counter if the transaction encounters a changed link.
        // Serializable prevents write skew across different invitations for the same athlete.
        const consumed = await tx.invitationLink.updateMany({
          where: {
            id: invitation.id, status: "ACTIVE", revokedAt: null, usedCount: invitation.usedCount,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: {
            usedCount: { increment: 1 }, updatedAt: now,
            status: invitation.maxUses !== null && invitation.usedCount + 1 >= invitation.maxUses
              ? "EXHAUSTED" : "ACTIVE",
          },
        });
        if (consumed.count !== 1) throw this.conflict();
        return tx.invitationUse.create({
          data: {
            id: randomUUID(), invitationId: invitation.id, userId: actor.data,
            athleteId: actor.data, usedAt: now,
            result: invitation.requiresApproval ? "PENDING_APPROVAL" : "JOINED",
          }, select: receiptSelect,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2003", "P2025", "P2034"].includes(error.code)) throw this.conflict();
      throw error;
    }
  }

  private conflict() {
    return new SchoolError("INVITATION_ACCEPT_CONFLICT", "O convite ou os vínculos foram alterados. Atualize e tente novamente.", 409);
  }
}
