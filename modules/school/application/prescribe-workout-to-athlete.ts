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
import { openWaterSessionSchema, type OpenWaterSession } from "../domain/open-water-session";
import { flattenToV1, sessionContentV2Schema, type SessionContentV2 } from "../domain/session-content-v2";
import { WorkoutAssignmentStatus, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc } from "../domain/local-date";
import { createWorkout, createWorkoutSnapshot } from "../domain/workout";
import { createWorkoutBlock } from "../domain/workout-block";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { prescriptionBlockSchema, type PrescriptionTarget } from "../domain/prescription-block";
import { hasRelativeTargets, resolveTargets } from "../domain/relative-targets";
import { loadSheetReferences } from "./relative-target-resolution";
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
function toPayload(target: Target, extra: Record<string, number> = {}): Record<string, number | { reference: string; value: number; sheetRevisionId: string | null; formula: string }> | null {
  const filled = Object.entries(target).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  // SAM-60 — the frozen reference of a resolved relative target travels with the values (§18.2).
  const merged = { ...Object.fromEntries(filled), ...(target.resolvedFrom ? { resolvedFrom: target.resolvedFrom } : {}), ...extra };
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
  blocks: z.array(prescriptionBlockSchema).max(40).default([]),
  /** SAM-65 — open-water session context; part of this immutable version. */
  openWater: openWaterSessionSchema.nullish().transform((v) => v ?? null),
  /**
   * SAM-69 — the v2 structure (nested sets, rest positions, send-off, manual
   * end, pool unit). When present it is the source: the v1 block rows are
   * derived from it for the readers that only know v1.
   */
  sessionV2: sessionContentV2Schema.nullish().transform((v) => v ?? null),
}).superRefine((input, ctx) => {
  if (input.blocks.length === 0 && !input.sessionV2) {
    ctx.addIssue({ code: "custom", path: ["blocks"], message: "Adicione ao menos um bloco." });
  }
  if ((input.scheduledAt === undefined) === (input.scheduledAtLocal === undefined)) {
    ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Informe data e horário." });
  }
});

type PrescriptionInput = z.infer<typeof prescribeWorkoutSchema>;
type CoachContext = { coachId: string; schoolId: string | null };

/**
 * Re-read inside the transaction: the membership (or, outside a school, the
 * coaching link itself) could have ended between the authorization check and
 * the write. Shared by prescribing and revising (SAM-59).
 */
export async function assertCoachingStillActive(tx: Prisma.TransactionClient, context: CoachContext, athleteId: string) {
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
}

/**
 * One immutable version of a prescribed workout: the Workout row with its
 * snapshot and block rows. Prescribing writes the first one; revising
 * (SAM-59) writes the next, pointing at the version it replaces.
 */
export async function writeWorkoutVersion(
  tx: Prisma.TransactionClient,
  args: {
    context: CoachContext;
    input: Pick<PrescriptionInput, "title" | "description" | "sportType" | "blocks" | "templateId" | "templateVersion"> & { openWater?: OpenWaterSession | null; sessionV2?: SessionContentV2 | null };
    scheduledAt: Date;
    now: Date;
    revision?: { supersedesWorkoutId: string; amendment: boolean; reason: string | null; revisedByUserId: string };
  },
) {
  const { context, input, scheduledAt, now } = args;
  const sourceBlocks = input.sessionV2 ? blocksOfSessionV2(input.sessionV2) : input.blocks;
  const blocks = sourceBlocks.map((block, position) => ({
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

  const workout = createWorkout({
    id: randomUUID(),
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
      content: { source: "coach-athlete-prescription", blocks, ...(input.sessionV2 ? { session: input.sessionV2 } : {}) },
    }),
  }, now);

  const repository = new WorkoutRepository(tx);
  const saved = await repository.create(workout);
  if (args.revision || input.openWater) {
    await tx.workout.update({
      where: { id: saved.id },
      data: {
        ...(args.revision ? {
          supersedesWorkoutId: args.revision.supersedesWorkoutId,
          amendment: args.revision.amendment,
          revisionReason: args.revision.reason,
          revisedByUserId: args.revision.revisedByUserId,
        } : {}),
        // SAM-65 — written with the version it belongs to, never edited afterwards.
        ...(input.openWater ? { sessionContext: input.openWater as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }
  for (const block of blocks) {
    await repository.createBlock(createWorkoutBlock({ ...block, workoutId: saved.id }, now));
  }
  return { workout: saved, blocks };
}
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

    // SAM-60 — "x–y% of FTP/CSS/limiar/FC" resolved against THIS athlete's sheet and frozen
    // with the prescription; a missing reference blocks instead of inventing a value (AC07).
    if (hasRelativeTargets(input.blocks)) {
      const resolution = resolveTargets(input.blocks, await loadSheetReferences(this.db, context, athleteId));
      if (!resolution.ok) throw new SchoolError("RELATIVE_REFERENCE_MISSING", resolution.reason, 409);
      input.blocks = resolution.blocks;
    }
    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        await assertCoachingStillActive(tx, context, athleteId);

        if (input.teamId) {
          // Teams belong to a school; an independent prescription has none.
          const team = context.schoolId === null ? null : await tx.team.findFirst({
            where: { id: input.teamId, schoolId: context.schoolId, archivedAt: null },
            select: { id: true },
          });
          if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada nesta escola.", 404);
        }

        const { workout: savedWorkout, blocks } = await writeWorkoutVersion(tx, { context, input, scheduledAt, now });

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

/**
 * SAM-69 — the v1 rows derived from a v2 session: only parts with a duration
 * or a metric distance (manual ends and yards stay only in the v2 structure,
 * never converted).
 */
export function blocksOfSessionV2(session: SessionContentV2): PrescriptionInput["blocks"] {
  return flattenToV1(session)
    .filter((row) => row.durationS !== null || row.distanceM !== null)
    .map((row) => ({
      blockType: row.blockType as PrescriptionInput["blocks"][number]["blockType"],
      title: row.title, durationS: row.durationS, distanceM: row.distanceM, repetitions: row.repetitions, restDurationS: row.restDurationS,
    }));
}
