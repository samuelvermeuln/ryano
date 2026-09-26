import type { Prisma, PrismaClient } from "@prisma/client";
import { SchoolError } from "../domain/errors";

/**
 * Resolves a CoachSchoolMembership id into the coach it refers to, rejecting a
 * membership that belongs to a different school.
 *
 * Callers address coaches by membership rather than by CoachProfile id because
 * the membership is what a school actually owns: it proves the coach works (or
 * worked) here. Accepting a bare coachId would let this school's URL address a
 * coach it has no relationship with.
 */
export async function resolveSchoolCoach(
  db: Pick<PrismaClient, "coachSchoolMembership"> | Prisma.TransactionClient,
  schoolId: string,
  membershipId: string,
) {
  const membership = await db.coachSchoolMembership.findUnique({
    where: { id: membershipId },
    select: { id: true, coachId: true, schoolId: true, status: true },
  });
  if (!membership || membership.schoolId !== schoolId) {
    throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
  }
  return membership;
}
