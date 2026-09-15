import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const revokeInvitationSchema = z.strictObject({ invitationId: idSchema });

// Never load or return the token hash through this management operation.
const publicSelect = {
  id: true, type: true, schoolId: true, coachId: true, createdBy: true,
  requiresApproval: true, expiresAt: true, maxUses: true, usedCount: true,
  status: true, createdAt: true, updatedAt: true, revokedAt: true,
} satisfies Prisma.InvitationLinkSelect;

export class RevokeInvitation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { invitationId } = revokeInvitationSchema.parse(raw);

    // A concurrent acceptance or revocation retries from a fresh authorized snapshot.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          const invitation = await tx.invitationLink.findUnique({ where: { id: invitationId }, select: publicSelect });
          if (!invitation) throw new SchoolError("INVITATION_NOT_FOUND", "Convite não encontrado.", 404);

          if (invitation.schoolId) {
            await new CanManageSchool(new SchoolMembershipRepository(tx)).assert(actor.data, invitation.schoolId);
          } else if (invitation.coachId) {
            const coach = await tx.coachProfile.findUnique({
              where: { id: invitation.coachId }, select: { userId: true },
            });
            if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
            if (coach.userId !== actor.data) {
              throw new SchoolError("FORBIDDEN", "Você não pode revogar este convite.", 403);
            }
          } else {
            throw new SchoolError("FORBIDDEN", "Você não pode revogar este convite.", 403);
          }

          // Repeat calls retain the original audit timestamp and still require current authorization.
          if (invitation.status === "REVOKED") return invitation;
          const now = z.date().parse(this.clock());
          if (now < invitation.updatedAt) {
            throw new SchoolError("INVITATION_INVALID_TIMESTAMP", "A data da revogação é inválida.", 400);
          }
          return tx.invitationLink.update({
            where: { id: invitation.id, status: invitation.status, updatedAt: invitation.updatedAt },
            data: { status: "REVOKED", revokedAt: now, updatedAt: now },
            select: publicSelect,
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
          if (attempt < 2) continue;
          throw new SchoolError("INVITATION_REVOKE_CONFLICT", "Não foi possível revogar o convite. Atualize e tente novamente.", 409);
        }
        throw error;
      }
    }
  }
}
