/**
 * T137 — AssignWorkoutToTeam
 *
 * Prescribes a workout to every active athlete in a team, creating one
 * WorkoutAssignment per athlete. Runs inside a single serializable transaction
 * so the fan-out is atomic. Duplicate assignments for the same (workoutId,
 * athleteId) are surfaced as WORKOUT_ASSIGN_CONFLICT (P2002).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkoutAssignment } from "../domain/workout-assignment";

type JsonPayload = Prisma.InputJsonValue;

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const assignWorkoutToTeamSchema = z.strictObject({
  workoutId: id,
  teamId: id,
  schoolId: id,
  scheduledAt: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
  dueAt: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
});

export class AssignWorkoutToTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = assignWorkoutToTeamSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        // Verify coach
        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, status: true } });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        // Verify coach has active membership in the school
        const membership = await tx.coachSchoolMembership.findFirst({
          where: { schoolId: input.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
        });
        if (!membership) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);

        // Verify workout
        const workout = await tx.workout.findUnique({ where: { id: input.workoutId }, select: { id: true, status: true } });
        if (!workout) throw new SchoolError("WORKOUT_NOT_FOUND", "Treino não encontrado.", 404);
        if (workout.status === WorkoutStatus.CANCELLED || workout.status === WorkoutStatus.ARCHIVED) {
          throw new SchoolError("WORKOUT_NOT_ASSIGNABLE", "O treino não pode ser prescrito neste estado.", 409);
        }

        // Verify team belongs to school
        const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, schoolId: true, archivedAt: true } });
        if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
        if (team.schoolId !== input.schoolId) throw new SchoolError("TEAM_NOT_IN_SCHOOL", "A turma não pertence a esta escola.", 403);
        if (team.archivedAt) throw new SchoolError("TEAM_ARCHIVED", "Não é possível prescrever treino a uma turma arquivada.", 409);

        // Fetch active team athletes
        const teamAthletes = await tx.teamAthlete.findMany({
          where: { teamId: input.teamId },
          select: { athleteId: true },
        });
        if (teamAthletes.length === 0) throw new SchoolError("TEAM_EMPTY", "A turma não possui atletas.", 409);

        const now = this.clock();
        const assignments = teamAthletes.map(({ athleteId }) =>
          createWorkoutAssignment({
            id: randomUUID(),
            workoutId: input.workoutId,
            workoutTemplateId: null,
            athleteId,
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
          }, now),
        );

        const historyRecords = assignments.map((a) => ({
          id: randomUUID(),
          workoutAssignmentId: a.id,
          eventType: "ASSIGNED",
          actorUserId: actor.data,
          payload: { workoutId: input.workoutId, athleteId: a.athleteId, schoolId: input.schoolId, teamId: input.teamId } as JsonPayload,
          createdAt: now,
        }));

        await tx.workoutAssignment.createMany({ data: assignments });
        await tx.workoutAssignmentHistory.createMany({ data: historyRecords });

        return { assignedCount: assignments.length, teamId: input.teamId, workoutId: input.workoutId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_ASSIGN_CONFLICT", "Não foi possível prescrever o treino. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
