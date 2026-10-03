/**
 * SAM-60 — individual and batch assignment with per-athlete individualization
 * (§10, §18.2, §22.2; AC06, AC07, AC09, AC14).
 *
 * - Preview: one row per athlete — authorization, relative targets resolved
 *   against THAT athlete's sheet (or blocked with the reason), totals and
 *   conflicts with sessions already on the same day. Nothing is written.
 * - Publish: recipients are frozen in AssignmentBatch; each one is published
 *   by the normal prescription in ITS OWN transaction, so one failure never
 *   undoes the others and a partial failure is never shown as success.
 *   The same `idempotencyKey` returns the existing batch (no duplicates).
 * - Retry failures: only FAILED recipients run again; OK ones are untouched.
 * - Undo: cancels the batch's FUTURE, not executed sessions only.
 * Every recipient gets its own Workout snapshot, so changing one later never
 * changes the others (AC09); the team only selects recipients — whoever joins
 * it later receives nothing retroactively (§10.3).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc, utcToLocalDateTime } from "../domain/local-date";
import { prescriptionBlockSchema } from "../domain/prescription-block";
import { resolveTargets, type ResolvedFrom } from "../domain/relative-targets";
import { plannedTotals } from "../domain/workout-structure";
import { rowsOfContentBlocks } from "../domain/workout-template-content";
import { CancelWorkout } from "./cancel-workout";
import type { CoachAthleteScopeInput } from "./coach-athlete-scope";
import { PrescribeWorkoutToAthlete } from "./prescribe-workout-to-athlete";
import { ReviseWorkoutAssignment } from "./prescription-revisions";
import { loadSheetReferences } from "./relative-target-resolution";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

type Clock = () => Date;
const MATCHED = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;

const scopeSchema = z.union([
  z.strictObject({ kind: z.literal("school"), schoolId: z.string().min(1).max(256) }),
  z.strictObject({ kind: z.literal("independent") }),
]);

/** The base prescription of the batch (builder payload, before overrides). */
const basePrescriptionSchema = z.strictObject({
  title: z.string().trim().min(1, "Informe um título.").max(200),
  sportType: z.string().trim().min(1).max(100),
  description: z.string().trim().max(5000).nullish().transform((v) => v ?? null),
  scheduledAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e horário."),
  blocks: z.array(prescriptionBlockSchema).min(1, "Adicione ao menos um bloco.").max(40),
  templateId: z.string().max(256).nullish().transform((v) => v ?? null),
  templateVersion: z.number().int().min(1).nullish().transform((v) => v ?? null),
});
type BasePrescription = z.infer<typeof basePrescriptionSchema>;

/** What one row may change (§10.1 "individualizar"): date, instructions and the whole block list. */
const overridesSchema = z.strictObject({
  scheduledAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  description: z.string().trim().max(5000).nullish(),
  blocks: z.array(prescriptionBlockSchema).min(1).max(40).optional(),
}).partial();
type Overrides = z.infer<typeof overridesSchema>;

const previewSchema = z.strictObject({
  scope: scopeSchema,
  athleteIds: z.array(z.string().min(1).max(256)).max(200).default([]),
  teamId: z.string().min(1).max(256).nullish(),
  prescription: basePrescriptionSchema,
  overrides: z.record(z.string(), overridesSchema).default({}),
});

const publishSchema = z.strictObject({
  scope: scopeSchema,
  idempotencyKey: z.string().min(8).max(200),
  teamId: z.string().min(1).max(256).nullish().transform((v) => v ?? null),
  prescription: basePrescriptionSchema,
  recipients: z.array(z.strictObject({ athleteId: z.string().min(1).max(256), overrides: overridesSchema.optional() })).min(1).max(200),
});

export type PreviewRow = {
  athleteId: string;
  athleteName: string | null;
  status: "READY" | "BLOCKED";
  reason: string | null;
  scheduledAtLocal: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  durationIsPartial: boolean;
  references: ResolvedFrom[];
  conflicts: Array<{ assignmentId: string; title: string | null; scheduledAt: Date | null }>;
};

type Prescriber = Pick<PrescribeWorkoutToAthlete, "execute">;

export class AssignmentBatches {
  private readonly prescribe: Prescriber;

  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date(), prescribe?: Prescriber) {
    this.prescribe = prescribe ?? new PrescribeWorkoutToAthlete(db, clock);
  }

  /** Team members (school scope) plus explicit athletes, deduplicated. */
  private async recipientsOf(scope: CoachAthleteScopeInput, athleteIds: string[], teamId: string | null | undefined) {
    const ids = [...athleteIds];
    if (teamId) {
      if (typeof scope === "string" || scope.kind !== "school") throw new SchoolError("TEAM_NOT_FOUND", "Turma só existe dentro de uma escola.", 404);
      const team = await this.db.team.findFirst({ where: { id: teamId, schoolId: scope.schoolId, archivedAt: null }, select: { members: { select: { athleteId: true } } } });
      if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada nesta escola.", 404);
      ids.push(...team.members.map((member) => member.athleteId));
    }
    return [...new Set(ids)];
  }

  async preview(actorUserId: string | null, raw: unknown): Promise<PreviewRow[]> {
    const input = previewSchema.parse(raw);
    const athleteIds = await this.recipientsOf(input.scope, input.athleteIds, input.teamId);
    const rows: PreviewRow[] = [];
    for (const athleteId of athleteIds) rows.push(await this.previewRow(actorUserId, input.scope, athleteId, input.prescription, input.overrides[athleteId] ?? {}));
    return rows;
  }

  private async previewRow(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, base: BasePrescription, overrides: Overrides): Promise<PreviewRow> {
    const scheduledAtLocal = overrides.scheduledAtLocal ?? base.scheduledAtLocal;
    const blocks = overrides.blocks ?? base.blocks;
    const user = await this.db.user.findUnique({ where: { id: athleteId }, select: { name: true } });
    const blocked = (reason: string): PreviewRow => ({
      athleteId, athleteName: user?.name ?? null, status: "BLOCKED", reason, scheduledAtLocal,
      durationSeconds: null, distanceMeters: null, durationIsPartial: false, references: [], conflicts: [],
    });
    let context;
    try {
      context = await new ResolveCoachAthleteContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    } catch {
      return blocked("Sem vínculo ativo com este atleta neste contexto.");
    }
    if (!context.isResponsibleCoach) return blocked("Você não é o professor responsável por este atleta.");
    const resolution = resolveTargets(blocks, await loadSheetReferences(this.db, context, athleteId));
    if (!resolution.ok) return blocked(resolution.reason);
    const totals = plannedTotals(rowsOfContentBlocks(resolution.blocks));
    // Conflicts: sessions already on that local day — shown before, never overwritten.
    const day = scheduledAtLocal.slice(0, 10);
    const from = localDateTimeToUtc(`${day}T00:00`, context.timeZone);
    const to = new Date(from.getTime() + 86_400_000);
    const existing = await this.db.workoutAssignment.findMany({
      where: { athleteId, status: { not: "CANCELLED" }, scheduledAt: { gte: from, lt: to } },
      select: { id: true, scheduledAt: true, workout: { select: { title: true } } },
    });
    return {
      athleteId, athleteName: user?.name ?? null, status: "READY", reason: null, scheduledAtLocal,
      durationSeconds: totals.durationSeconds, distanceMeters: totals.distanceMeters, durationIsPartial: totals.durationIsPartial,
      references: resolution.references,
      conflicts: existing.map((row) => ({ assignmentId: row.id, title: row.workout?.title ?? null, scheduledAt: row.scheduledAt })),
    };
  }

  async publish(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = publishSchema.parse(raw);
    const existing = await this.db.assignmentBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
    if (existing) return this.get(actorUserId, existing.id);
    const coach = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    if (!coach) throw new SchoolError("FORBIDDEN", "Apenas professores atribuem treinos.", 403);
    const batchId = randomUUID();
    try {
      await this.db.assignmentBatch.create({
        data: {
          id: batchId, idempotencyKey: input.idempotencyKey, authorUserId: actorUserId, coachId: coach.id,
          schoolId: input.scope.kind === "school" ? input.scope.schoolId : null, teamId: input.teamId,
          templateId: input.prescription.templateId, templateVersion: input.prescription.templateVersion,
          payload: input.prescription as unknown as Prisma.InputJsonValue,
          // Recipients frozen at publication (§10.3).
          recipients: { create: input.recipients.map((recipient) => ({ id: randomUUID(), athleteId: recipient.athleteId, overrides: (recipient.overrides ?? {}) as Prisma.InputJsonValue })) },
        },
      });
    } catch (error) {
      // The same key sent twice at the same time: the other request created it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.db.assignmentBatch.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
        return this.get(actorUserId, winner.id);
      }
      throw error;
    }
    await this.runPending(actorUserId, batchId, ["PENDING"]);
    return this.get(actorUserId, batchId);
  }

  /** "Repetir falhas" — only FAILED recipients; OK ones are never published twice (§22.2). */
  async retryFailed(actorUserId: string | null, batchId: string) {
    await this.get(actorUserId, batchId);
    await this.runPending(actorUserId!, batchId, ["FAILED"]);
    return this.get(actorUserId, batchId);
  }

  private async runPending(actorUserId: string, batchId: string, statuses: string[]) {
    const batch = await this.db.assignmentBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { recipients: { where: { status: { in: statuses } } } },
    });
    const base = basePrescriptionSchema.parse(batch.payload);
    const scope: CoachAthleteScopeInput = batch.schoolId ? { kind: "school", schoolId: batch.schoolId } : { kind: "independent" };
    for (const recipient of batch.recipients) {
      const overrides = overridesSchema.parse(recipient.overrides ?? {});
      try {
        const { assignment } = await this.prescribe.execute(actorUserId, scope, recipient.athleteId, {
          title: base.title, sportType: base.sportType,
          description: overrides.description !== undefined ? overrides.description : base.description,
          scheduledAtLocal: overrides.scheduledAtLocal ?? base.scheduledAtLocal,
          teamId: batch.teamId, blocks: overrides.blocks ?? base.blocks,
          templateId: base.templateId, templateVersion: base.templateVersion,
        });
        await this.db.assignmentBatchRecipient.update({ where: { id: recipient.id }, data: { status: "OK", reason: null, assignmentId: assignment.id, attempts: { increment: 1 } } });
      } catch (error) {
        const blocked = error instanceof SchoolError && (error.code === "RELATIVE_REFERENCE_MISSING" || error.status === 403 || error.status === 404);
        const reason = error instanceof z.ZodError
          ? error.issues[0]?.message ?? "Dados inválidos."
          : error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida.";
        await this.db.assignmentBatchRecipient.update({ where: { id: recipient.id }, data: { status: blocked ? "BLOCKED" : "FAILED", reason, attempts: { increment: 1 } } });
      }
    }
  }

  /** Undo: cancels only the batch's FUTURE, not executed sessions; history stays. */
  async undoFuture(actorUserId: string | null, batchId: string) {
    const view = await this.get(actorUserId, batchId);
    const actor = actorUserId!;
    const now = this.clock();
    const cancel = new CancelWorkout(this.db, this.clock);
    let undone = 0;
    for (const recipient of view.recipients) {
      if (recipient.status !== "OK" || !recipient.assignmentId) continue;
      const assignment = await this.db.workoutAssignment.findUnique({
        where: { id: recipient.assignmentId },
        select: { scheduledAt: true, status: true, executions: { where: { matchStatus: { in: [...MATCHED] } }, select: { id: true }, take: 1 } },
      });
      if (!assignment?.scheduledAt || assignment.scheduledAt <= now || assignment.executions.length > 0 || assignment.status === "CANCELLED") continue;
      await cancel.execute(actor, { assignmentId: recipient.assignmentId, reason: "Lote desfeito pelo professor" });
      await this.db.assignmentBatchRecipient.update({ where: { batchId_athleteId: { batchId, athleteId: recipient.athleteId } }, data: { status: "UNDONE" } });
      undone += 1;
    }
    return { undone };
  }

  /** The batch with each recipient's result — only its author sees it. */
  async get(actorUserId: string | null, batchId: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const batch = await this.db.assignmentBatch.findUnique({
      where: { id: batchId },
      include: { recipients: { include: { athlete: { select: { name: true } } }, orderBy: { athleteId: "asc" } } },
    });
    if (!batch || batch.authorUserId !== actorUserId) throw new SchoolError("ASSIGNMENT_BATCH_NOT_FOUND", "Lote não encontrado.", 404);
    const counts = { ok: 0, failed: 0, blocked: 0, undone: 0, pending: 0 };
    for (const recipient of batch.recipients) counts[recipient.status.toLowerCase() as keyof typeof counts] += 1;
    return {
      id: batch.id,
      createdAt: batch.createdAt,
      counts,
      // A partial failure is never a success (§21.5).
      complete: counts.failed === 0 && counts.pending === 0 && counts.blocked === 0,
      recipients: batch.recipients.map((recipient) => ({
        athleteId: recipient.athleteId, athleteName: recipient.athlete.name, status: recipient.status,
        reason: recipient.reason, assignmentId: recipient.assignmentId, attempts: recipient.attempts,
      })),
    };
  }
}

/** Local "YYYY-MM-DDTHH:mm" of an instant (used by the template "update future sessions" list). */
export function localInput(instant: Date, timeZone: string) {
  const local = utcToLocalDateTime(instant, timeZone);
  return `${local.date}T${local.time}`;
}

/**
 * SAM-60 — "Atualizar sessões futuras" from a newer template version (§9.4):
 * a separate, explicit action. Lists this coach's future, not executed
 * sessions made from an older version; the coach picks them and each one is
 * revised (new version, the old one kept — SAM-59). Executed sessions are
 * never touched; nothing happens without the coach's selection.
 */
export class UpdateFutureSessionsFromTemplate {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async listOutdated(actorUserId: string | null, templateId: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const coach = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    const template = await this.db.workoutTemplate.findUnique({ where: { id: templateId }, select: { version: true } });
    if (!coach || !template) return { currentVersion: template?.version ?? null, sessions: [] };
    const rows = await this.db.workoutAssignment.findMany({
      where: {
        coachId: coach.id, status: { not: "CANCELLED" }, scheduledAt: { gt: this.clock() }, amendmentWorkoutId: null,
        workout: { templateId, templateVersion: { lt: template.version } },
        executions: { none: { matchStatus: { in: [...MATCHED] } } },
      },
      select: { id: true, athleteId: true, schoolId: true, scheduledAt: true, prescriptionVersion: true, athlete: { select: { name: true } }, workout: { select: { templateVersion: true, title: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    });
    return {
      currentVersion: template.version,
      sessions: rows.map((row) => ({
        assignmentId: row.id, athleteId: row.athleteId, athleteName: row.athlete.name, schoolId: row.schoolId, scheduledAt: row.scheduledAt,
        fromVersion: row.workout?.templateVersion ?? null, title: row.workout?.title ?? null, prescriptionVersion: row.prescriptionVersion,
      })),
    };
  }

  async apply(actorUserId: string | null, templateId: string, raw: unknown) {
    const { assignmentIds, reason } = z.strictObject({
      assignmentIds: z.array(z.string().min(1).max(256)).min(1, "Escolha ao menos uma sessão.").max(200),
      reason: z.string().trim().max(500).nullish(),
    }).parse(raw);
    const { sessions, currentVersion } = await this.listOutdated(actorUserId, templateId);
    const version = currentVersion
      ? await this.db.workoutTemplateVersion.findUnique({ where: { templateId_number: { templateId, number: currentVersion } } })
      : null;
    const template = await this.db.workoutTemplate.findUnique({ where: { id: templateId }, select: { title: true, sportType: true, description: true } });
    if (!version || !template) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Modelo não encontrado.", 404);
    const content = z.object({ instructions: z.string().nullish(), blocks: z.array(prescriptionBlockSchema) }).parse(version.content);
    const revise = new ReviseWorkoutAssignment(this.db, this.clock);
    const results: Array<{ assignmentId: string; status: "OK" | "FAILED"; reason: string | null }> = [];
    for (const assignmentId of assignmentIds) {
      const session = sessions.find((item) => item.assignmentId === assignmentId);
      if (!session?.scheduledAt) {
        results.push({ assignmentId, status: "FAILED", reason: "Sessão não elegível (passada, executada ou de outro professor)." });
        continue;
      }
      try {
        await revise.execute(actorUserId, session.schoolId ? { kind: "school", schoolId: session.schoolId } : { kind: "independent" }, session.athleteId, assignmentId, {
          expectedVersion: session.prescriptionVersion,
          reason: reason ?? `Atualizada para a versão ${currentVersion} do modelo`,
          prescription: {
            title: template.title, sportType: template.sportType, description: content.instructions ?? template.description ?? null,
            scheduledAt: session.scheduledAt.toISOString(), blocks: content.blocks, templateId, templateVersion: currentVersion,
          },
        });
        results.push({ assignmentId, status: "OK", reason: null });
      } catch (error) {
        results.push({ assignmentId, status: "FAILED", reason: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida." });
      }
    }
    return { currentVersion, results };
  }
}
