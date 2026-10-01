import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutBlockType, WorkoutRequestStatus, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc } from "../domain/local-date";
import { createWorkout, createWorkoutSnapshot } from "../domain/workout";
import { createWorkoutBlock } from "../domain/workout-block";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { WorkoutRepository } from "../infrastructure/workout-repository";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const fulfillWorkoutRequestSchema = z.strictObject({
  requestId: id,
  title: z.string().trim().min(1).max(200),
  sportType: z.string().trim().min(1).max(100).nullish().transform((v) => v ?? null),
  scheduledAt: z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v)).optional(),
  /** SAM-16 — wall-clock `YYYY-MM-DDTHH:mm` read in the request's school zone. */
  scheduledAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/).optional(),
  durationSeconds: z.number().int().min(0).nullish().transform((v) => v ?? null),
  distanceMeters: z.number().finite().min(0).nullish().transform((v) => v ?? null),
}).superRefine((input, ctx) => {
  if ((input.scheduledAt === undefined) === (input.scheduledAtLocal === undefined)) {
    ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Informe data e horário." });
  }
});

/**
 * Coach approves a pending WorkoutRequest: creates a minimal Workout,
 * assigns it to the requesting athlete, and closes the request — all in one
 * transaction. This mirrors CreateWorkout + AssignWorkout inline (rather
 * than composing those two use-cases, which each open their own
 * transaction and can't be nested).
 */
export class FulfillWorkoutRequest {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = fulfillWorkoutRequestSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, status: true } });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        const request = await tx.workoutRequest.findUnique({ where: { id: input.requestId } });
        if (!request) throw new SchoolError("WORKOUT_REQUEST_NOT_FOUND", "Pedido de treino não encontrado.", 404);
        if (request.status !== WorkoutRequestStatus.PENDING) {
          throw new SchoolError("WORKOUT_REQUEST_NOT_PENDING", "Este pedido já foi decidido.", 409);
        }

        const membership = await tx.coachSchoolMembership.findFirst({
          where: { schoolId: request.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
        });
        if (!membership) {
          throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);
        }

        const scheduledAt = input.scheduledAtLocal !== undefined
          ? localDateTimeToUtc(
            input.scheduledAtLocal,
            (await tx.school.findUnique({ where: { id: request.schoolId }, select: { timezone: true } }))?.timezone
              ?? "America/Sao_Paulo",
          )
          : input.scheduledAt!;

        const now = this.clock();
        const sportType = input.sportType ?? request.sportType;
        const snapshot = createWorkoutSnapshot({
          templateId: null,
          templateVersion: null,
          title: input.title,
          description: null,
          sportType,
          content: { source: "workout-request", requestId: request.id },
        });
        const workout = createWorkout({
          id: randomUUID(),
          templateId: null,
          templateVersion: null,
          authorCoachId: coach.id,
          originSchoolId: request.schoolId,
          title: input.title,
          description: null,
          sportType,
          scheduledDate: scheduledAt,
          scheduledStartAt: scheduledAt,
          status: WorkoutStatus.SCHEDULED,
          snapshotPayload: snapshot,
        }, now);

        const repo = new WorkoutRepository(tx);
        const savedWorkout = await repo.create(workout);

        if (input.durationSeconds !== null || input.distanceMeters !== null) {
          await repo.createBlock(createWorkoutBlock({
            id: randomUUID(),
            workoutId: savedWorkout.id,
            position: 0,
            blockType: WorkoutBlockType.FREE,
            title: null,
            distanceM: input.distanceMeters,
            durationS: input.durationSeconds,
            repetitions: null,
            targetPayload: null,
            restPayload: null,
          }, now));
        }

        const assignment = createWorkoutAssignment({
          id: randomUUID(),
          workoutId: savedWorkout.id,
          workoutTemplateId: null,
          athleteId: request.athleteId,
          assignedBy: actor.data,
          schoolId: request.schoolId,
          coachId: coach.id,
          teamId: null,
          scheduledAt,
          dueAt: null,
          status: WorkoutAssignmentStatus.SCHEDULED,
          matchStatus: null,
          matchedActivityId: null,
          matchedAt: null,
          matchScore: null,
          trainingLicenseId: null,
        }, now);
        const savedAssignment = await tx.workoutAssignment.create({ data: assignment });

        const [updatedRequest] = await Promise.all([
          tx.workoutRequest.update({
            where: { id: request.id },
            data: {
              status: WorkoutRequestStatus.APPROVED,
              decidedBy: actor.data,
              decidedAt: now,
              resultingAssignmentId: savedAssignment.id,
              updatedAt: now,
            },
          }),
          tx.workoutAssignmentHistory.create({
            data: {
              id: randomUUID(),
              workoutAssignmentId: savedAssignment.id,
              eventType: "ASSIGNED",
              actorUserId: actor.data,
              payload: { requestId: request.id },
              createdAt: now,
            },
          }),
        ]);

        await new AuditService(tx).log({
          schoolId: request.schoolId,
          actorUserId: actor.data,
          action: AuditAction.WORKOUT_REQUEST_APPROVED,
          entityType: AuditEntityType.WORKOUT_REQUEST,
          entityId: request.id,
          metadata: { assignmentId: savedAssignment.id, workoutId: savedWorkout.id },
        });

        // SAM-29 — the athlete asked for this workout; the prescription is the answer.
        await new NotificationService(tx, () => now).notify({
          userId: request.athleteId,
          kind: UserNotificationKind.WORKOUT_REQUEST_DECIDED,
          title: "Seu pedido de treino foi atendido",
          body: `"${input.title}" foi prescrito para você. Abra o treino para ver a estrutura e a data.`,
          href: `/atleta/${request.schoolId}/treinos/${savedAssignment.id}`,
          payload: { requestId: request.id, assignmentId: savedAssignment.id, schoolId: request.schoolId, decision: "APPROVED" },
        });

        return { request: updatedRequest, assignment: savedAssignment, workout: savedWorkout };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_REQUEST_FULFILL_CONFLICT", "Não foi possível aprovar o pedido. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
