import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment } from "../domain/coach-athlete-assignment";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** Shared by assignment and transfer workflows; the caller owns the serializable transaction. */
export async function assignCoachToAthleteInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  schoolId: string,
  athleteId: string,
  coachId: string,
  now: Date,
) {
  const school = await tx.school.findUnique({
    where: { id: schoolId }, select: { id: true, ownerUserId: true, status: true },
  });
  if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
  await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actorId, schoolId);
  if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

  const athlete = await new SchoolAthleteMembershipRepository(tx).findActiveBySchoolAndAthlete(schoolId, athleteId);
  if (!athlete) throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_NOT_ACTIVE", "O atleta não possui vínculo ativo com esta escola.", 409);
  const coach = await new CoachSchoolMembershipRepository(tx).findActiveBySchoolAndCoach(schoolId, coachId);
  if (!coach) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 409);

  const assignments = new CoachAthleteAssignmentRepository(tx);
  if (await assignments.findActivePrimaryBySchoolAndAthlete(schoolId, athleteId)) {
    throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "O atleta já possui professor principal nesta escola.", 409);
  }
  const pending = createCoachAthleteAssignment({ id: randomUUID(), schoolId, athleteId, coachId, isPrimary: true, sportType: null }, now);
  return assignments.create(transitionCoachAthleteAssignment(pending, "ACTIVE", now, actorId));
}

export class AssignCoachToAthlete {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, coachId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const targets = z.tuple([id, id, id]).safeParse([schoolId, athleteId, coachId]);
    if (!targets.success) throw new SchoolError("INVALID_INPUT", "Informe escola, atleta e professor válidos.", 400);
    const [school, athlete, coach] = targets.data;
    try {
      return await this.db.$transaction(
        (tx) => assignCoachToAthleteInTransaction(tx, actor.data, school, athlete, coach, this.clock()),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2025"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Os vínculos foram alterados. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
