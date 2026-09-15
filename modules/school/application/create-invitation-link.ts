import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { InvitationType } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createInvitationLink } from "../domain/invitation-link";
import { generateInvitationToken } from "../infrastructure/invitation-token";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const createInvitationLinkSchema = z.strictObject({
  type: z.enum(InvitationType),
  schoolId: idSchema.nullish().transform((value) => value ?? null),
  coachId: idSchema.nullish().transform((value) => value ?? null),
  requiresApproval: z.boolean().default(true),
  expiresAt: z.union([z.date(), z.iso.datetime({ offset: true }).transform((value) => new Date(value))])
    .nullish().transform((value) => value ?? null),
  maxUses: z.number().int().positive().max(2147483647).nullish().transform((value) => value ?? null),
});

/** Actor identity comes from the server session, outside the untrusted invitation DTO. */
export class CreateInvitationLink {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = createInvitationLinkSchema.parse(raw);
    const now = this.clock();
    if (input.expiresAt && input.expiresAt <= now) {
      throw new SchoolError("INVITATION_INVALID_EXPIRATION", "A expiração deve estar no futuro.", 400);
    }
    const issued = generateInvitationToken();
    // The domain owns type/scope and initial-state invariants. Raw token is never part of this object.
    const invitation = createInvitationLink({
      ...input, id: randomUUID(), createdBy: actor.data, ...issued.persistence,
    }, now);

    try {
      return await this.db.$transaction(async (tx) => {
        if (invitation.schoolId) {
          const school = await tx.school.findUnique({
            where: { id: invitation.schoolId }, select: { id: true, status: true },
          });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          await new CanManageSchool(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        }
        if (invitation.coachId) {
          const coach = await tx.coachProfile.findUnique({
            where: { id: invitation.coachId }, select: { id: true, userId: true, status: true },
          });
          if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
          if (!invitation.schoolId && coach.userId !== actor.data) {
            throw new SchoolError("FORBIDDEN", "Você não pode criar convites para este professor.", 403);
          }
          if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
          if (invitation.schoolId) {
            const membership = await tx.coachSchoolMembership.findFirst({
              where: { schoolId: invitation.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null },
              select: { id: true },
            });
            if (!membership) {
              throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 409);
            }
          }
        }
        const stored = await tx.invitationLink.create({
          data: invitation,
          select: {
            id: true, type: true, schoolId: true, coachId: true, createdBy: true,
            requiresApproval: true, expiresAt: true, maxUses: true, usedCount: true,
            status: true, createdAt: true, updatedAt: true, revokedAt: true,
          },
        });
        return { invitation: stored, token: issued.token };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("INVITATION_CREATE_CONFLICT", "Não foi possível criar o convite. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
