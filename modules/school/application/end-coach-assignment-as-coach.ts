import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * An independent coach ends one of their own ACTIVE coaching links (SAM-26).
 *
 * Inside a school the administration owns that decision (`EndCoachAssignment`),
 * so only links without a school are accepted here. The period closes as ENDED
 * with the coach as actor; nothing is deleted and the athlete's history grant
 * stays theirs to manage.
 */
export class EndCoachAssignmentAsCoach {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, assignmentId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(assignmentId).success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, userId: true } });
        if (!coach) throw new SchoolError("FORBIDDEN", "Apenas um professor pode encerrar um acompanhamento.", 403);

        const assignments = new CoachAthleteAssignmentRepository(tx);
        const assignment = await assignments.findById(assignmentId);
        if (!assignment || assignment.coachId !== coach.id) throw this.notFound();
        if (assignment.schoolId) {
          throw new SchoolError("FORBIDDEN", "Dentro de uma escola, quem encerra o acompanhamento é a administração.", 403);
        }
        if (assignment.status !== "ACTIVE") {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Só um acompanhamento ativo pode ser encerrado.", 409);
        }

        const ended = await assignments.updateStatus(assignment.id, "ENDED", this.clock(), coach.userId);
        if (!ended) throw this.notFound();
        return ended;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "O acompanhamento foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Acompanhamento não encontrado.", 404);
  }
}
