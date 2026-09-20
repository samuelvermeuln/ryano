import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutMatchStatus, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkout, createWorkoutSnapshot } from "../domain/workout";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { createWorkoutExecution } from "../domain/workout-execution";
import { WorkoutRepository } from "../infrastructure/workout-repository";

type JsonPayload = Prisma.InputJsonValue;

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const logUnplannedWorkoutSchema = z.strictObject({
  sportType: z.string().trim().min(1).max(100),
  scheduledAt: z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v)),
  durationSeconds: z.number().int().min(1).max(86400).nullish().transform((v) => v ?? null),
  distanceMeters: z.number().finite().min(0).nullish().transform((v) => v ?? null),
  note: z.string().trim().max(2000).nullish().transform((v) => v ?? null),
}).superRefine((input, ctx) => {
  if (input.durationSeconds === null && input.distanceMeters === null) {
    ctx.addIssue({ code: "custom", path: ["durationSeconds"], message: "Informe duração ou distância." });
  }
});

/**
 * Self-reported log of an activity the athlete already performed, with no
 * prior prescription. Reuses the Workout/WorkoutAssignment/WorkoutExecution
 * schema instead of touching the provider-integration Activity model: a
 * minimal self-report Workout, an UNPLANNED WorkoutAssignment auto-assigned
 * by the athlete to themselves, and an already-CONFIRMED WorkoutExecution.
 * WorkoutCard already renders "Realizado" from execution data with a
 * CONFIRMED matchStatus — no UI change is needed for it to show up.
 */
export class LogUnplannedWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = logUnplannedWorkoutSchema.parse(raw);

    const now = this.clock();
    if (input.scheduledAt.getTime() > now.getTime()) {
      throw new SchoolError("WORKOUT_LOG_INVALID_DATE", "Não é possível registrar uma atividade no futuro.", 422);
    }

    try {
      return await this.db.$transaction(async (tx) => {
        const snapshot = createWorkoutSnapshot({
          templateId: null,
          templateVersion: null,
          title: "Atividade registrada",
          description: input.note,
          sportType: input.sportType,
          content: { source: "self-report" },
        });

        const workout = createWorkout({
          id: randomUUID(),
          templateId: null,
          templateVersion: null,
          authorCoachId: null,
          originSchoolId: null,
          title: snapshot.title,
          description: input.note,
          sportType: input.sportType,
          scheduledDate: input.scheduledAt,
          scheduledStartAt: input.scheduledAt,
          status: WorkoutStatus.COMPLETED,
          snapshotPayload: snapshot,
        }, now);

        const repo = new WorkoutRepository(tx);
        const savedWorkout = await repo.create(workout);

        const assignment = createWorkoutAssignment({
          id: randomUUID(),
          workoutId: savedWorkout.id,
          workoutTemplateId: null,
          athleteId: actor.data,
          assignedBy: actor.data,
          schoolId: null,
          coachId: null,
          teamId: null,
          scheduledAt: input.scheduledAt,
          dueAt: null,
          status: WorkoutAssignmentStatus.UNPLANNED,
          matchStatus: null,
          matchedActivityId: null,
          matchedAt: null,
          matchScore: null,
          trainingLicenseId: null,
        }, now);
        const savedAssignment = await tx.workoutAssignment.create({ data: assignment });

        const execution = createWorkoutExecution({
          id: randomUUID(),
          workoutAssignmentId: savedAssignment.id,
          athleteId: actor.data,
          source: "self-report",
          externalId: randomUUID(),
          sportType: input.sportType,
          startedAt: input.scheduledAt,
          durationSeconds: input.durationSeconds,
          distanceMeters: input.distanceMeters,
          matchScore: 100,
          matchStatus: WorkoutMatchStatus.CONFIRMED,
          activityPayload: { source: "self-report", note: input.note },
        }, now);

        const [savedExecution] = await Promise.all([
          tx.workoutExecution.create({ data: { ...execution, activityPayload: execution.activityPayload as Prisma.InputJsonValue } }),
          tx.workoutAssignmentHistory.create({
            data: {
              id: randomUUID(),
              workoutAssignmentId: savedAssignment.id,
              eventType: "SELF_LOGGED",
              actorUserId: actor.data,
              payload: { source: "self-report" } as JsonPayload,
              createdAt: now,
            },
          }),
        ]);

        return { workout: savedWorkout, assignment: savedAssignment, execution: savedExecution };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_LOG_CONFLICT", "Não foi possível registrar a atividade. Tente novamente.", 409);
      }
      throw error;
    }
  }
}
