import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Ends an athlete's ACTIVE membership in a school.
 *
 * The coach assignments the athlete held *in that school* end with it, in the
 * same transaction (SAM-26): an ACTIVE assignment becomes ENDED and a PENDING
 * request becomes REJECTED. Independent coaching (no school) is untouched.
 * Nothing is deleted — the periods stay as history.
 */
export class RemoveAthleteFromSchool {
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
        // The repository enforces ACTIVE -> ENDED and protects concurrent updates.
        const ended = await memberships.updateStatus(membership.id, "ENDED", now);
        if (!ended) throw this.notFound();

        const scope = { athleteId: membership.athleteId, schoolId: school.id };
        await tx.coachAthleteAssignment.updateMany({
          where: { ...scope, status: "ACTIVE" },
          data: { status: "ENDED", endedAt: now, endedBy: actor.data, updatedAt: now },
        });
        await tx.coachAthleteAssignment.updateMany({
          where: { ...scope, status: "PENDING" },
          data: { status: "REJECTED", endedAt: now, endedBy: actor.data, updatedAt: now },
        });

        return ended;
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
