/**
 * SAM-59 — draft and publication of a prescription, revisions with a chain
 * of versions, amendments after execution and concurrency (§6 passo 9, §6.1,
 * §9.4, §21.5, AC19, AC22).
 *
 * - A draft is NOT a WorkoutAssignment: it lives in PrescriptionDraft, which
 *   no athlete reader queries, so "o aluno não vê rascunho" holds by
 *   construction. Publishing runs the normal prescription and drops the draft.
 * - Revising a published prescription writes a NEW Workout version that
 *   points at the one it replaces (kept readable, marked ARCHIVED =
 *   substituída); the assignment moves to the new version.
 * - When the athlete already executed the session the change is an
 *   amendment: the new version is recorded (`amendmentWorkoutId`) but the
 *   assignment keeps the version received, so the comparison never changes.
 * - Every revision carries the assignment's `prescriptionVersion`; a stale
 *   one is a recoverable conflict, never a silent overwrite.
 * The athlete never edits a prescription (AC19): these use cases require the
 * responsible coach, like prescribing.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc, utcToLocalDateTime } from "../domain/local-date";
import { prescriptionBlocksOfRows } from "../domain/prescription-block";
import type { CoachAthleteScopeInput } from "./coach-athlete-scope";
import {
  assertCoachingStillActive,
  PrescribeWorkoutToAthlete,
  prescribeWorkoutSchema,
  writeWorkoutVersion,
} from "./prescribe-workout-to-athlete";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";
import { hasRelativeTargets, resolveTargets } from "../domain/relative-targets";
import { loadFrozenReference } from "./athlete-assessments";
import { loadSheetReferences } from "./relative-target-resolution";

type Clock = () => Date;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;
const MATCHED = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;

async function responsibleContext(db: PrismaClient, clock: Clock, actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string) {
  const context = await new ResolveCoachAthleteContext(db, clock).execute(actorUserId, scope, athleteId);
  if (!context.isResponsibleCoach) {
    throw new SchoolError("FORBIDDEN", "Somente o professor responsável por este atleta altera as prescrições dele.", 403);
  }
  return context;
}

/** What a draft may hold: the builder's fields, possibly incomplete. Validated fully only when published. */
const draftPayloadSchema = z.strictObject({
  title: z.string().max(200).default(""),
  sportType: z.string().max(100).default(""),
  description: z.string().max(5000).nullish().transform((v) => v ?? null),
  scheduledAtLocal: z.string().max(20).nullish().transform((v) => v ?? null),
  teamId: z.string().max(256).nullish().transform((v) => v ?? null),
  blocks: z.array(z.unknown()).max(40).default([]),
  templateId: z.string().max(256).nullish().transform((v) => v ?? null),
  templateVersion: z.number().int().min(1).nullish().transform((v) => v ?? null),
  /** SAM-65 — open-water context, validated fully only when published. */
  openWater: z.unknown().nullish().transform((v) => v ?? null),
  /** SAM-69 — v2 structure, validated fully only when published. */
  sessionV2: z.unknown().nullish().transform((v) => v ?? null),
});

export class PrescriptionDrafts {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async save(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, raw: unknown) {
    const context = await responsibleContext(this.db, this.clock, actorUserId, scope, athleteId);
    const { draftId, expectedVersion, payload } = z.strictObject({
      draftId: z.string().min(1).max(256).nullish(),
      expectedVersion: z.number().int().min(1).nullish(),
      payload: draftPayloadSchema,
    }).parse(raw);
    const data = { title: payload.title || "Rascunho sem título", scheduledAtLocal: payload.scheduledAtLocal, payload: payload as Prisma.InputJsonValue };
    if (draftId) {
      const updated = await this.db.prescriptionDraft.updateMany({
        where: { id: draftId, coachId: context.coachId, athleteId, ...(expectedVersion ? { version: expectedVersion } : {}) },
        data: { ...data, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new SchoolError("PRESCRIPTION_DRAFT_CONFLICT", "O rascunho foi alterado em outra aba. Recarregue — seu texto continua aqui.", 409);
      return this.db.prescriptionDraft.findUniqueOrThrow({ where: { id: draftId } });
    }
    return this.db.prescriptionDraft.create({ data: { id: randomUUID(), coachId: context.coachId, athleteId, schoolId: context.schoolId, ...data } });
  }

  async list(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string) {
    const context = await responsibleContext(this.db, this.clock, actorUserId, scope, athleteId);
    return this.db.prescriptionDraft.findMany({
      where: { coachId: context.coachId, athleteId, schoolId: context.schoolId },
      select: { id: true, title: true, scheduledAtLocal: true, updatedAt: true, version: true, payload: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async remove(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, draftId: string) {
    const context = await responsibleContext(this.db, this.clock, actorUserId, scope, athleteId);
    const { count } = await this.db.prescriptionDraft.deleteMany({ where: { id: draftId, coachId: context.coachId, athleteId } });
    if (count === 0) throw new SchoolError("PRESCRIPTION_DRAFT_NOT_FOUND", "Rascunho não encontrado.", 404);
    return { removed: true };
  }

  /** Publishing = the normal prescription with the draft's content; the draft then disappears. */
  async publish(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, draftId: string) {
    const context = await responsibleContext(this.db, this.clock, actorUserId, scope, athleteId);
    const draft = await this.db.prescriptionDraft.findFirst({ where: { id: draftId, coachId: context.coachId, athleteId } });
    if (!draft) throw new SchoolError("PRESCRIPTION_DRAFT_NOT_FOUND", "Rascunho não encontrado.", 404);
    const payload = draftPayloadSchema.parse(draft.payload);
    const result = await new PrescribeWorkoutToAthlete(this.db, this.clock).execute(actorUserId, scope, athleteId, {
      title: payload.title, sportType: payload.sportType, description: payload.description, scheduledAtLocal: payload.scheduledAtLocal ?? undefined,
      teamId: payload.teamId, blocks: payload.blocks, templateId: payload.templateId, templateVersion: payload.templateVersion,
    });
    await this.db.prescriptionDraft.deleteMany({ where: { id: draft.id } });
    return result;
  }
}

const revisionSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
  prescription: z.unknown(),
});

export class ReviseWorkoutAssignment {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, assignmentId: string, raw: unknown) {
    const context = await responsibleContext(this.db, this.clock, actorUserId, scope, athleteId);
    const { expectedVersion, reason, prescription } = revisionSchema.parse(raw);
    const input = prescribeWorkoutSchema.parse(prescription);
    const assignment = await this.db.workoutAssignment.findFirst({
      where: { id: assignmentId, athleteId, coachId: context.coachId, schoolId: context.schoolId, status: { not: "CANCELLED" } },
      select: {
        id: true, workoutId: true, amendmentWorkoutId: true, status: true, prescriptionVersion: true,
        executions: { where: { matchStatus: { in: [...MATCHED] } }, select: { id: true }, take: 1 },
      },
    });
    if (!assignment?.workoutId) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Prescrição não encontrada.", 404);
    const executed = assignment.executions.length > 0 || assignment.status === "COMPLETED" || assignment.status === "PARTIALLY_COMPLETED";
    if (executed && !reason) {
      throw new z.ZodError([{ code: "custom", path: ["reason"], message: "Informe o motivo da emenda: o treino já foi realizado.", input: reason }]);
    }
    let scheduledAt: Date;
    try {
      scheduledAt = input.scheduledAtLocal !== undefined ? localDateTimeToUtc(input.scheduledAtLocal, context.timeZone) : input.scheduledAt!;
    } catch {
      throw new z.ZodError([{ code: "custom", path: ["scheduledAt"], message: "Data ou horário inválido.", input: input.scheduledAtLocal }]);
    }
    // SAM-60 — relative targets resolve against this athlete's sheet now, like a new prescription.
    if (hasRelativeTargets(input.blocks)) {
      const resolution = resolveTargets(input.blocks, await loadSheetReferences(this.db, context, athleteId));
      if (!resolution.ok) throw new SchoolError("RELATIVE_REFERENCE_MISSING", resolution.reason, 409);
      input.blocks = resolution.blocks;
    }
    const now = this.clock();
    const previousId = assignment.amendmentWorkoutId ?? assignment.workoutId;
    // SAM-70 — a new version is written against the reference in force now (§18.2).
    const reference = await loadFrozenReference(this.db, context, athleteId);

    return this.db.$transaction(async (tx) => {
      await assertCoachingStillActive(tx, context, athleteId);
      const { workout } = await writeWorkoutVersion(tx, {
        context, input, scheduledAt, now, reference,
        revision: { supersedesWorkoutId: previousId, amendment: executed, reason, revisedByUserId: actorUserId! },
      });
      const updated = await tx.workoutAssignment.updateMany({
        where: { id: assignment.id, prescriptionVersion: expectedVersion },
        data: executed
          // The session was executed: comparison keeps the version received.
          ? { amendmentWorkoutId: workout.id, prescriptionVersion: { increment: 1 } }
          : { workoutId: workout.id, scheduledAt, prescriptionVersion: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new SchoolError("PRESCRIPTION_CONFLICT", "Esta prescrição foi alterada por outra pessoa. Recarregue — seu rascunho local continua na tela.", 409);
      }
      // The replaced version stays readable; ARCHIVED here means "substituída".
      if (!executed) await tx.workout.update({ where: { id: previousId }, data: { status: "ARCHIVED" } });
      await tx.workoutAssignmentHistory.create({
        data: {
          id: randomUUID(), workoutAssignmentId: assignment.id, eventType: executed ? "AMENDED" : "REVISED", actorUserId: actorUserId!,
          payload: { fromWorkoutId: previousId, toWorkoutId: workout.id, reason }, createdAt: now,
        },
      });
      return { assignmentId: assignment.id, workoutId: workout.id, amendment: executed, prescriptionVersion: expectedVersion + 1 };
    }, TX);
  }
}

export type PrescriptionVersionView = {
  workoutId: string;
  title: string;
  createdAt: Date;
  amendment: boolean;
  reason: string | null;
  revisedByName: string | null;
  current: boolean;
  received: boolean;
};

/**
 * The chain of versions of one assignment, newest first: the amendment (if
 * any), the version the athlete received, and every version it replaced.
 * Readable by the athlete and by whoever may read the assignment.
 */
export async function prescriptionVersionsOf(db: Pick<PrismaClient, "workout">, assignment: { workoutId: string | null; amendmentWorkoutId: string | null }): Promise<PrescriptionVersionView[]> {
  const versions: PrescriptionVersionView[] = [];
  let cursor = assignment.amendmentWorkoutId ?? assignment.workoutId;
  const names = new Map<string, string | null>();
  for (let guard = 0; cursor && guard < 50; guard += 1) {
    const row: { id: string; title: string; createdAt: Date; amendment: boolean; revisionReason: string | null; revisedByUserId: string | null; supersedesWorkoutId: string | null } | null = await db.workout.findUnique({
      where: { id: cursor },
      select: { id: true, title: true, createdAt: true, amendment: true, revisionReason: true, revisedByUserId: true, supersedesWorkoutId: true },
    });
    if (!row) break;
    versions.push({
      workoutId: row.id, title: row.title, createdAt: row.createdAt, amendment: row.amendment, reason: row.revisionReason,
      revisedByName: row.revisedByUserId ? names.get(row.revisedByUserId) ?? null : null,
      current: row.id === (assignment.amendmentWorkoutId ?? assignment.workoutId), received: row.id === assignment.workoutId,
    });
    cursor = row.supersedesWorkoutId;
  }
  return versions;
}

/**
 * The published version a revision starts from (for the builder and its
 * diff): content, local date-time in the athlete's calendar zone, the
 * concurrency version and whether the session was already executed.
 */
export class GetRevisionBaseline {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, assignmentId: string) {
    const context = await responsibleContext(this.db, this.clock, actorUserId, scope, athleteId);
    const assignment = await this.db.workoutAssignment.findFirst({
      where: { id: assignmentId, athleteId, coachId: context.coachId, schoolId: context.schoolId, status: { not: "CANCELLED" } },
      select: {
        id: true, status: true, prescriptionVersion: true, workoutId: true, amendmentWorkoutId: true, scheduledAt: true, teamId: true,
        executions: { where: { matchStatus: { in: [...MATCHED] } }, select: { id: true }, take: 1 },
      },
    });
    const currentId = assignment?.amendmentWorkoutId ?? assignment?.workoutId;
    if (!assignment || !currentId) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Prescrição não encontrada.", 404);
    const workout = await this.db.workout.findUniqueOrThrow({
      where: { id: currentId },
      select: { title: true, description: true, sportType: true, templateId: true, templateVersion: true, blocks: { orderBy: { position: "asc" } } },
    });
    const local = assignment.scheduledAt ? utcToLocalDateTime(assignment.scheduledAt, context.timeZone) : null;
    return {
      assignmentId: assignment.id,
      prescriptionVersion: assignment.prescriptionVersion,
      executed: assignment.executions.length > 0 || assignment.status === "COMPLETED" || assignment.status === "PARTIALLY_COMPLETED",
      templateId: workout.templateId,
      templateVersion: workout.templateVersion,
      before: {
        title: workout.title,
        description: workout.description,
        sportType: workout.sportType,
        scheduledAtLocal: local ? `${local.date}T${local.time}` : null,
        blocks: prescriptionBlocksOfRows(workout.blocks as unknown as Array<Record<string, unknown>>),
      },
    };
  }
}
