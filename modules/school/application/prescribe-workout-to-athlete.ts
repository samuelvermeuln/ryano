/**
 * The coach prescribes a structured workout to one of their athletes, from the
 * athlete's own screen.
 *
 * Reuses the existing building blocks rather than reimplementing them:
 * `createWorkout` / `createWorkoutSnapshot` / `createWorkoutBlock` /
 * `createWorkoutAssignment` from the domain, `WorkoutRepository` for
 * persistence, and `ResolveCoachAthleteContext` for authorization.
 *
 * Why it is one use case and not `CreateWorkout` followed by `AssignWorkout`:
 * each of those opens its own serializable transaction, and Prisma transactions
 * do not nest — a failure between them would leave an orphan `Workout` with no
 * prescription, which is exactly the shape `FulfillWorkoutRequest` already
 * inlines the same two steps to avoid. The domain invariants stay in the domain
 * factories, so nothing is duplicated except the transaction boundary.
 *
 * Authorization deliberately does NOT trust the URL: `ResolveCoachAthleteContext`
 * verifies the active coach profile, this school's coach membership, the
 * athlete's active membership in this school, and that the actor may read this
 * athlete at all. On top of that, prescribing requires being the athlete's
 * assigned coach — an administrator may read the sheet but does not prescribe in
 * a coach's name, which would make `Workout.authorCoachId` a fiction.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc } from "../domain/local-date";
import { createWorkout, createWorkoutSnapshot } from "../domain/workout";
import { createWorkoutBlock } from "../domain/workout-block";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { prescriptionBlockSchema, type PrescriptionTarget } from "../domain/prescription-block";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { WorkoutRepository } from "../infrastructure/workout-repository";
import { schoolLogger } from "../infrastructure/logger";
import type { CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

type Target = PrescriptionTarget;

/**
 * Only the keys the coach actually filled in reach the payload; an empty one
 * becomes `null` so `describeBlockTargets` renders nothing rather than an empty
 * chip row.
 */
function toPayload(target: Target, extra: Record<string, number> = {}): Record<string, number> | null {
  const filled = Object.entries(target).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  const merged = { ...Object.fromEntries(filled), ...extra };
  return Object.keys(merged).length > 0 ? merged : null;
}

const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

export const prescribeWorkoutSchema = z.strictObject({
  title: z.string().trim().min(1, "Informe um título.").max(200),
  /** Canonical `RyvanoSportType`; validated against the catalogue by the caller. */
  sportType: z.string().trim().min(1, "Escolha a modalidade.").max(100),
  description: z.string().trim().max(5000).nullish().transform((v) => v ?? null),
  /** An absolute instant (API callers). */
  scheduledAt: z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v)).optional(),
  /**
   * SAM-16 — the wall-clock time the coach typed (`datetime-local`), read in
   * the school's zone. The form has no zone of its own, and the school's is
   * the one both coach and athlete share.
   */
  scheduledAtLocal: z.string().regex(LOCAL_DATE_TIME_RE, "Informe data e horário.").optional(),
  teamId: z.string().min(1).max(256).nullish().transform((v) => v ?? null),
  /** SAM-58 — the catalog version the coach started from ("Usar este modelo"): recorded, never re-read. */
  templateId: z.string().min(1).max(256).nullish().transform((v) => v ?? null),
  templateVersion: z.number().int().min(1).nullish().transform((v) => v ?? null),
  blocks: z.array(prescriptionBlockSchema).min(1, "Adicione ao menos um bloco.").max(40),
}).superRefine((input, ctx) => {
  if ((input.scheduledAt === undefined) === (input.scheduledAtLocal === undefined)) {
    ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Informe data e horário." });
  }
});

export class PrescribeWorkoutToAthlete {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, raw: unknown) {
    const log = schoolLogger("prescribe-workout-to-athlete");
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    const input = prescribeWorkoutSchema.parse(raw);

    if (!context.isResponsibleCoach) {
      throw new SchoolError(
        "FORBIDDEN",
        "Somente o professor responsável por este atleta pode prescrever treinos para ele.",
        403,
      );
    }

    // SAM-58 — provenance only: the template must be one this coach may use in this scope, at an existing version.
    if (input.templateId) {
      const template = await this.db.workoutTemplate.findUnique({
        where: { id: input.templateId },
        select: { ownerType: true, authorCoachId: true, schoolId: true, versions: { where: { number: input.templateVersion ?? -1 }, select: { id: true } } },
      });
      const usable = template && (template.ownerType === "COACH" ? template.authorCoachId === context.coachId : template.schoolId !== null && template.schoolId === context.schoolId);
      if (!usable || template.versions.length === 0) {
        throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Modelo não encontrado.", 404);
      }
    }

    let scheduledAt: Date;
    if (input.scheduledAtLocal !== undefined) {
      try {
        scheduledAt = localDateTimeToUtc(input.scheduledAtLocal, context.timeZone);
      } catch {
        throw new z.ZodError([{ code: "custom", path: ["scheduledAt"], message: "Data ou horário inválido.", input: input.scheduledAtLocal }]);
      }
    } else {
      scheduledAt = input.scheduledAt!;
    }

    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        // Re-read inside the transaction: the membership (or, outside a school,
        // the coaching link itself) could have ended between the authorization
        // check and the write.
        if (context.schoolId !== null) {
          const membership = await tx.coachSchoolMembership.findFirst({
            where: { schoolId: context.schoolId, coachId: context.coachId, status: "ACTIVE", endedAt: null },
            select: { id: true },
          });
          if (!membership) {
            throw new SchoolError(
              "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE",
              "O professor não possui vínculo ativo com esta escola.",
              403,
            );
          }
        } else {
          const link = await tx.coachAthleteAssignment.findFirst({
            where: { athleteId, coachId: context.coachId, schoolId: null, status: "ACTIVE", endedAt: null },
            select: { id: true },
          });
          if (!link) {
            throw new SchoolError(
              "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND",
              "O acompanhamento com este atleta não está mais ativo.",
              404,
            );
          }
        }

        if (input.teamId) {
          // Teams belong to a school; an independent prescription has none.
          const team = context.schoolId === null ? null : await tx.team.findFirst({
            where: { id: input.teamId, schoolId: context.schoolId, archivedAt: null },
            select: { id: true },
          });
          if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada nesta escola.", 404);
        }

        const blocks = input.blocks.map((block, position) => ({
          id: randomUUID(),
          position,
          blockType: block.blockType,
          title: block.title,
          durationS: block.durationS,
          distanceM: block.distanceM,
          repetitions: block.repetitions,
          targetPayload: toPayload(block.target ?? {}),
          // The rest duration travels with the rest targets so the structure
          // renders as "recuperação: 2 min, Zona 1" in one place.
          restPayload: toPayload(
            block.rest ?? {},
            block.restDurationS === null ? {} : { durationS: block.restDurationS },
          ),
        }));

        const workoutId = randomUUID();
        const workout = createWorkout({
          id: workoutId,
          templateId: input.templateId,
          templateVersion: input.templateId ? input.templateVersion : null,
          authorCoachId: context.coachId,
          originSchoolId: context.schoolId,
          title: input.title,
          description: input.description,
          sportType: input.sportType,
          scheduledDate: scheduledAt,
          scheduledStartAt: scheduledAt,
          status: WorkoutStatus.SCHEDULED,
          snapshotPayload: createWorkoutSnapshot({
            templateId: input.templateId,
            templateVersion: input.templateId ? input.templateVersion : null,
            title: input.title,
            description: input.description,
            sportType: input.sportType,
            // The snapshot is what stays true after the blocks are edited.
            content: { source: "coach-athlete-prescription", blocks },
          }),
        }, now);

        const repository = new WorkoutRepository(tx);
        const savedWorkout = await repository.create(workout);
        for (const block of blocks) {
          await repository.createBlock(createWorkoutBlock({ ...block, workoutId: savedWorkout.id }, now));
        }

        const assignment = createWorkoutAssignment({
          id: randomUUID(),
          workoutId: savedWorkout.id,
          workoutTemplateId: input.templateId,
          athleteId,
          assignedBy: actorUserId,
          schoolId: context.schoolId,
          coachId: context.coachId,
          teamId: input.teamId,
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

        await tx.workoutAssignmentHistory.create({
          data: {
            id: randomUUID(),
            workoutAssignmentId: savedAssignment.id,
            eventType: "ASSIGNED",
            actorUserId: actorUserId!,
            payload: { workoutId: savedWorkout.id, blockCount: blocks.length },
            createdAt: now,
          },
        });

        // Independent coaching has no school log (the assignment history row
        // above is its trail), same rule as the coaching requests.
        if (context.schoolId !== null) {
          await new AuditService(tx).log({
            schoolId: context.schoolId,
            actorUserId,
            action: AuditAction.WORKOUT_ASSIGNED,
            entityType: AuditEntityType.ASSIGNMENT,
            entityId: savedAssignment.id,
            metadata: { athleteId, workoutId: savedWorkout.id, blockCount: blocks.length },
          });
        }

        log.info("workout_prescribed", {
          assignmentId: savedAssignment.id,
          workoutId: savedWorkout.id,
          correlationId: log.correlationId,
        });
        return { workout: savedWorkout, assignment: savedAssignment };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2003", "P2034"].includes(error.code)
      ) {
        log.warn("workout_prescribe_conflict", { correlationId: log.correlationId });
        throw new SchoolError(
          "WORKOUT_ASSIGN_CONFLICT",
          "Não foi possível prescrever o treino. Atualize e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }
}
