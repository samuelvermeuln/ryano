import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Refuses a PENDING athlete request.
 *
 * Everything the athlete attached to the request falls with it, in the same
 * transaction (SAM-24): the SCHOOL history grant they consented to while
 * asking is revoked — there is no link for it to serve — and a PENDING
 * assignment to the preferred coach is rejected. Nothing is deleted; the
 * history keeps the refusal.
 */
export class RejectAthleteMembership {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const membershipTarget = idSchema.safeParse(membershipId);
    if (!membershipTarget.success) throw this.notFound();

    const school = await this.db.school.findUnique({
      where: { id: schoolTarget.data }, select: { id: true, ownerUserId: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    // School-level delegated administration is added with the membership policy.
    if (school.ownerUserId !== actor.data) {
      throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
    }

    try {
      return await this.db.$transaction(async (tx) => {
        const memberships = new SchoolAthleteMembershipRepository(tx);
        const membership = await memberships.findById(membershipTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();

        const now = this.clock();
        // The repository enforces PENDING -> REJECTED and protects concurrent updates.
        const rejected = await memberships.updateStatus(membership.id, "REJECTED", now, actor.data);
        if (!rejected) throw this.notFound();

        await tx.historyAccessGrant.updateMany({
          where: { athleteId: membership.athleteId, schoolId: school.id, granteeType: "SCHOOL", status: "ACTIVE" },
          data: { status: "REVOKED", revokedBy: actor.data, revokedAt: now, updatedAt: now },
        });
        await tx.coachAthleteAssignment.updateMany({
          where: { athleteId: membership.athleteId, schoolId: school.id, status: "PENDING" },
          data: { status: "REJECTED", endedAt: now, endedBy: actor.data, updatedAt: now },
        });

        return rejected;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", "O vínculo do atleta foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", "Vínculo do atleta não encontrado.", 404);
  }
}
