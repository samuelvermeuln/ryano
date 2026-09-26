import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachAthleteAssignmentRepository } from "../infrastructure/coach-athlete-assignment-repository";
import { assignCoachToAthleteInTransaction } from "./assign-coach-to-athlete";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const reasonSchema = z.string().trim().min(1).max(500).nullish().transform((value) => value ?? null);

export class ChangeAthleteCoach {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, coachId: string, rawReason?: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const targets = z.tuple([id, id, id]).safeParse([schoolId, athleteId, coachId]);
    if (!targets.success) throw new SchoolError("INVALID_INPUT", "Informe escola, atleta e professor válidos.", 400);
    const [school, athlete, coach] = targets.data;
    const reason = reasonSchema.parse(rawReason);
    try {
      return await this.db.$transaction(async (tx) => {
        const ownedSchool = await tx.school.findUnique({ where: { id: school }, select: { ownerUserId: true, status: true } });
        if (!ownedSchool) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        if (ownedSchool.ownerUserId !== actor.data) throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
        if (ownedSchool.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        const assignments = new CoachAthleteAssignmentRepository(tx);
        const previous = await assignments.findActivePrimaryBySchoolAndAthlete(school, athlete);
        if (!previous) throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Atribuição não encontrada.", 404);
        if (previous.coachId === coach) throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Este professor já acompanha o atleta.", 409);
        const now = this.clock();
        const ended = await assignments.updateStatus(previous.id, "ENDED", now, actor.data);
        if (!ended) throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "A atribuição foi alterada. Atualize e tente novamente.", 409);
        // Both periods commit together; validation failure restores the previous assignment.
        const opened = await assignCoachToAthleteInTransaction(tx, actor.data, school, athlete, coach, now, reason);
        await new AuditService(tx).log({
          schoolId: school,
          actorUserId: actor.data,
          action: AuditAction.ATHLETE_COACH_CHANGED,
          entityType: AuditEntityType.ASSIGNMENT,
          entityId: opened.id,
          metadata: {
            athleteId: athlete,
            previousCoachId: previous.coachId,
            previousAssignmentId: previous.id,
            coachId: coach,
            reason,
          },
        });
        return opened;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Os vínculos foram alterados. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
