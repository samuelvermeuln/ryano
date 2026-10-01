import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { WorkoutAssignmentRepository } from "../infrastructure/workout-assignment-repository";
import { UpdateWorkoutAssignmentStatus } from "./update-workout-assignment-status";
import { resolveWorkoutAssignmentParticipant } from "./workout-assignment-participant";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const reportWorkoutAbsenceSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000).nullish().transform((value) => value ?? null),
});

const REPORTABLE: readonly string[] = [
  WorkoutAssignmentStatus.SCHEDULED,
  WorkoutAssignmentStatus.AVAILABLE,
  WorkoutAssignmentStatus.RESCHEDULED,
  WorkoutAssignmentStatus.MISSED,
];

/**
 * SAM-27 — the athlete says they will not (or did not) do this session. With a
 * reason the prescription becomes JUSTIFIED, which adherence does not count as
 * a miss (spec D5/AC-1.11); without one it becomes MISSED. The status change
 * and its history row go through UpdateWorkoutAssignmentStatus, so the trail
 * reads the same as every other transition.
 */
export class ReportWorkoutAbsence {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, assignmentId: string, raw: unknown = {}) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = reportWorkoutAbsenceSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const { role, assignment } = await resolveWorkoutAssignmentParticipant(tx, actor.data, assignmentId);
        if (role !== "athlete") throw new SchoolError("FORBIDDEN", "Só o atleta informa a própria falta.", 403);
        if (!REPORTABLE.includes(assignment.status)) {
          throw new SchoolError("WORKOUT_ABSENCE_NOT_APPLICABLE", "Este treino já foi realizado ou encerrado.", 409);
        }

        const now = this.clock();
        const status = input.reason ? WorkoutAssignmentStatus.JUSTIFIED : WorkoutAssignmentStatus.MISSED;
        const updated = await new UpdateWorkoutAssignmentStatus(new WorkoutAssignmentRepository(tx)).execute(
          { userId: actor.data, isActive: true },
          { assignmentId: assignment.id, status, ...(input.reason ? { reason: input.reason } : {}) },
          now,
        );

        if (assignment.schoolId) {
          await new AuditService(tx).log({
            schoolId: assignment.schoolId,
            actorUserId: actor.data,
            action: AuditAction.WORKOUT_ABSENCE_REPORTED,
            entityType: AuditEntityType.ASSIGNMENT,
            entityId: assignment.id,
            metadata: { status, justified: Boolean(input.reason) },
          });
        }

        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_ASSIGNMENT_CONFLICT", "O treino foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
