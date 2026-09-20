import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { schoolLogger } from "../infrastructure/logger";

type JsonPayload = Prisma.InputJsonValue;

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const assignWorkoutSchema = z.strictObject({
  workoutId: id,
  athleteId: id,
  schoolId: id.nullish().transform((v) => v ?? null),
  teamId: id.nullish().transform((v) => v ?? null),
  scheduledAt: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
  dueAt: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
});

/** Prescribes a workout to a single athlete. The assigning coach's active membership is verified. */
export class AssignWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const log = schoolLogger("assign-workout");
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = assignWorkoutSchema.parse(raw);

    log.info("workout_assign_start", { actorUserId, workoutId: input.workoutId, athleteId: input.athleteId, correlationId: log.correlationId });

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { userId: actor.data }, select: { id: true, status: true },
        });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        const workout = await tx.workout.findUnique({ where: { id: input.workoutId }, select: { id: true, status: true, originSchoolId: true } });
        if (!workout) throw new SchoolError("WORKOUT_NOT_FOUND", "Treino não encontrado.", 404);
        if (workout.status === WorkoutStatus.CANCELLED || workout.status === WorkoutStatus.ARCHIVED) {
          throw new SchoolError("WORKOUT_NOT_ASSIGNABLE", "O treino não pode ser prescrito neste estado.", 409);
        }

        const athlete = await tx.user.findUnique({ where: { id: input.athleteId }, select: { id: true } });
        if (!athlete) throw new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado.", 404);

        if (input.schoolId) {
          const membership = await tx.coachSchoolMembership.findFirst({
            where: { schoolId: input.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
          });
          if (!membership) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);
          }
          const athleteMembership = await tx.schoolAthleteMembership.findFirst({
            where: { schoolId: input.schoolId, athleteId: input.athleteId, status: "ACTIVE" }, select: { id: true },
          });
          if (!athleteMembership) {
            throw new SchoolError("ATHLETE_NOT_MEMBER", "O atleta não é membro ativo desta escola.", 403);
          }
        }

        const now = this.clock();
        const assignment = createWorkoutAssignment({
          id: randomUUID(),
          workoutId: input.workoutId,
          workoutTemplateId: null,
          athleteId: input.athleteId,
          assignedBy: actor.data,
          schoolId: input.schoolId,
          coachId: coach.id,
          teamId: input.teamId,
          scheduledAt: input.scheduledAt,
          dueAt: input.dueAt,
          status: WorkoutAssignmentStatus.SCHEDULED,
          matchStatus: null,
          matchedActivityId: null,
          matchedAt: null,
          matchScore: null,
          trainingLicenseId: null,
        }, now);

        const historyId = randomUUID();
        const historyPayload: JsonPayload = { workoutId: input.workoutId, athleteId: input.athleteId, schoolId: input.schoolId ?? null };
        const [saved] = await Promise.all([
          tx.workoutAssignment.create({ data: assignment }),
          tx.workoutAssignmentHistory.create({
            data: { id: historyId, workoutAssignmentId: assignment.id, eventType: "ASSIGNED", actorUserId: actor.data, payload: historyPayload, createdAt: now },
          }),
        ]);

        log.info("workout_assigned", { assignmentId: saved.id, workoutId: input.workoutId, athleteId: input.athleteId, correlationId: log.correlationId });
        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        log.warn("workout_assign_conflict", { workoutId: input.workoutId, athleteId: input.athleteId, correlationId: log.correlationId });
        throw new SchoolError("WORKOUT_ASSIGN_CONFLICT", "Não foi possível prescrever o treino. Atualize e tente novamente.", 409);
      }
      log.error("workout_assign_unexpected", { error: String(error), correlationId: log.correlationId });
      throw error;
    }
  }
}
