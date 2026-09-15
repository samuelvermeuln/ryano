import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class EndCoachAssignment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, assignmentId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(schoolId).success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const notFound = () => new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Atribuição não encontrada.", 404);
    if (!id.safeParse(assignmentId).success) throw notFound();
    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true, ownerUserId: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.ownerUserId !== actor.data) throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
    const assignments = new CoachAthleteAssignmentRepository(this.db);
    const assignment = await assignments.findById(assignmentId);
    if (!assignment || assignment.schoolId !== school.id) throw notFound();
    try {
      const ended = await assignments.updateStatus(assignment.id, "ENDED", this.clock(), actor.data);
      if (!ended) throw notFound();
      return ended;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "A atribuição foi alterada. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
