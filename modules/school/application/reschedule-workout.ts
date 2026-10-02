import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc } from "../domain/local-date";
import { resolveAthleteTimeZone } from "./athlete-time-zone";

type JsonPayload = Prisma.InputJsonValue;

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const rescheduleWorkoutSchema = z.strictObject({
  assignmentId: id,
  scheduledAt: z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v)).optional(),
  /** SAM-16 — wall-clock `YYYY-MM-DDTHH:mm` read in the assignment's school zone. */
  scheduledAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/).optional(),
  dueAt: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
  reason: z.string().max(2000).optional(),
}).superRefine((input, ctx) => {
  if ((input.scheduledAt === undefined) === (input.scheduledAtLocal === undefined)) {
    ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Informe data e horário." });
  }
});

// SAM-16 — a prescription moved once can be moved again from the agenda; each
// move is its own history row, so nothing is lost by allowing it.
const reschedulableStatuses = new Set<string>([
  WorkoutAssignmentStatus.SCHEDULED,
  WorkoutAssignmentStatus.AVAILABLE,
  WorkoutAssignmentStatus.RESCHEDULED,
]);

/** Moves a scheduled assignment to a new date and records the change for audit. */
export class RescheduleWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = rescheduleWorkoutSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const assignment = await tx.workoutAssignment.findUnique({ where: { id: input.assignmentId } });
        if (!assignment) throw new SchoolError("STORE_NOT_FOUND", "Prescrição de treino não encontrada.", 404);
        if (!reschedulableStatuses.has(assignment.status)) {
          throw new SchoolError("WORKOUT_INVALID_TRANSITION", "O treino não pode ser reagendado neste estado.", 409);
        }

        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
        if (!coach || coach.id !== assignment.coachId) {
          throw new SchoolError("FORBIDDEN", "Apenas o professor responsável pode reagendar este treino.", 403);
        }

        // Inside a school the wall clock is the school's; outside one (independent
        // coaching, marketplace plan) it is the athlete's own zone (SAM-36), the
        // same one their calendar and the independent hub read.
        const scheduledAt = input.scheduledAtLocal !== undefined
          ? localDateTimeToUtc(
            input.scheduledAtLocal,
            assignment.schoolId
              ? (await tx.school.findUnique({ where: { id: assignment.schoolId }, select: { timezone: true } }))?.timezone
                ?? await resolveAthleteTimeZone(tx, assignment.athleteId)
              : await resolveAthleteTimeZone(tx, assignment.athleteId),
          )
          : input.scheduledAt!;

        if (input.dueAt && input.dueAt < scheduledAt) {
          throw new SchoolError("WORKOUT_INVALID_PERIOD", "A data de vencimento não pode ser anterior ao agendamento.", 422);
        }

        const now = this.clock();
        const historyPayload: JsonPayload = {
          previousScheduledAt: assignment.scheduledAt?.toISOString() ?? null,
          previousDueAt: assignment.dueAt?.toISOString() ?? null,
          newScheduledAt: scheduledAt.toISOString(),
          newDueAt: input.dueAt?.toISOString() ?? null,
          ...(input.reason !== undefined && { reason: input.reason }),
        };
        const [updated] = await Promise.all([
          tx.workoutAssignment.update({
            where: { id: input.assignmentId },
            data: { scheduledAt, dueAt: input.dueAt, status: WorkoutAssignmentStatus.RESCHEDULED, updatedAt: now },
          }),
          tx.workoutAssignmentHistory.create({
            data: { id: randomUUID(), workoutAssignmentId: input.assignmentId, eventType: "RESCHEDULED", actorUserId: actor.data, payload: historyPayload, createdAt: now },
          }),
        ]);

        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_ASSIGN_CONFLICT", "A prescrição foi alterada. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
