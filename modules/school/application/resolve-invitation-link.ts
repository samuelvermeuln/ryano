import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { InvitationStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { hashInvitationToken } from "../infrastructure/invitation-token";

// Preserve the exact bearer credential; normalization would accept a different token.
export const resolveInvitationLinkSchema = z.strictObject({ token: z.string().min(1).max(512) });

/** Read-only preview. Acceptance must recheck availability inside its own transaction. */
export class ResolveInvitationLink {
  constructor(
    private readonly db: Pick<PrismaClient | Prisma.TransactionClient, "invitationLink">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(raw: unknown) {
    const { token } = resolveInvitationLinkSchema.parse(raw);
    const invitation = await this.db.invitationLink.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      select: {
        id: true, type: true, schoolId: true, coachId: true,
        requiresApproval: true, expiresAt: true, maxUses: true, usedCount: true,
        status: true, revokedAt: true,
      },
    });
    if (!invitation) throw new SchoolError("INVITATION_NOT_FOUND", "Convite não encontrado.", 404);
    if (invitation.status === InvitationStatus.REVOKED || invitation.revokedAt !== null) {
      throw new SchoolError("INVITATION_REVOKED", "Este convite foi revogado.", 409);
    }
    const now = this.clock();
    if (invitation.status === InvitationStatus.EXPIRED || (invitation.expiresAt !== null && invitation.expiresAt <= now)) {
      throw new SchoolError("INVITATION_EXPIRED", "Este convite expirou.", 409);
    }
    if (invitation.status === InvitationStatus.EXHAUSTED
      || (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses)) {
      throw new SchoolError("INVITATION_EXHAUSTED", "Este convite atingiu o limite de usos.", 409);
    }
    return invitation;
  }
}
