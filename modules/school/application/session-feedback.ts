/**
 * SAM-61 — the athlete's report of a session (§6.1, §13.8, §17.3, §18.3,
 * §19.1; AC12, AC24): done fully/partially/not, RPE when the prescription
 * asks for it (scale and moment kept), difficulty, adaptation/interruption
 * reason (safety is not a failure), pain, note and an attachment link.
 *
 * - Works without a watch: "não realizei" and a manual record of the
 *   prescribed session (`source = "manual"`, author identified) need no
 *   matched execution.
 * - The report changes the EXECUTION state, never the prescription.
 * - Pain warns the responsible coach once per report (FEEDBACK_PAIN_REPORTED
 *   + a HIGH task), saying the app is not an emergency channel.
 * - An unplanned/imported activity gets its own feedback (`activityId`).
 * The coach's observation lives in the comments/evaluation, by its own
 * author — never over the athlete's text (AC24).
 */
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { NotificationService } from "@/modules/shared/notifications";
import { SchoolError } from "../domain/errors";
import { ADAPTATION_REASONS, deriveExecutionState } from "../domain/execution-state";
import { loadFollowUpPolicy } from "./follow-up-reminders";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";
import { raiseFollowUp } from "./follow-up-tasks";

type Clock = () => Date;
const MATCHED = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const sessionFeedbackSchema = z.strictObject({
  assignmentId: z.string().min(1).max(256).optional(),
  activityId: z.string().min(1).max(256).optional(),
  completion: z.enum(["FULL", "PARTIAL", "NOT_DONE"]).nullish().transform((v) => v ?? null),
  rpe: z.number().int().min(1).max(10).nullish().transform((v) => v ?? null),
  difficulty: z.number().int().min(1).max(5).nullish().transform((v) => v ?? null),
  adaptationReason: z.enum(ADAPTATION_REASONS).nullish().transform((v) => v ?? null),
  adaptationNote: text(1000),
  painReported: z.boolean().default(false),
  painNote: text(1000),
  comment: text(2000),
  attachmentUrl: z.string().trim().url().max(500).nullish().transform((v) => v ?? null),
  /** Manual record of the prescribed session (no watch): what was done. */
  manual: z.strictObject({
    durationMinutes: z.number().min(1).max(1440).nullish(),
    distanceMeters: z.number().min(1).max(1_000_000).nullish(),
    startedAt: z.iso.datetime({ offset: true }).nullish(),
  }).nullish(),
}).superRefine((input, ctx) => {
  if ((input.assignmentId === undefined) === (input.activityId === undefined)) {
    ctx.addIssue({ code: "custom", path: ["assignmentId"], message: "Informe a sessão prescrita OU a atividade." });
  }
  if (input.manual && input.completion === "NOT_DONE") {
    ctx.addIssue({ code: "custom", path: ["manual"], message: "Sessão não realizada não tem registro manual." });
  }
  if (input.manual && !input.manual.durationMinutes && !input.manual.distanceMeters) {
    ctx.addIssue({ code: "custom", path: ["manual"], message: "Informe duração ou distância do que você fez." });
  }
  if (input.painReported && !input.painNote) {
    ctx.addIssue({ code: "custom", path: ["painNote"], message: "Descreva brevemente a dor ou dificuldade." });
  }
});

function feedbackColumns(input: z.infer<typeof sessionFeedbackSchema>, now: Date) {
  return {
    completion: input.completion, rpe: input.rpe, rpeScale: input.rpe !== null ? "CR10" : null,
    rpeCollectedAt: input.rpe !== null ? now : null, difficulty: input.difficulty, adaptationReason: input.adaptationReason,
    adaptationNote: input.adaptationNote, painReported: input.painReported, painNote: input.painReported ? input.painNote : null,
    comment: input.comment, attachmentUrl: input.attachmentUrl,
  };
}

export class SubmitSessionFeedback {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = sessionFeedbackSchema.parse(raw);
    const now = this.clock();
    if (input.activityId) return this.forActivity(actorUserId, input, now);
    return this.forAssignment(actorUserId, input, now);
  }

  private async forActivity(actorUserId: string, input: z.infer<typeof sessionFeedbackSchema>, now: Date) {
    const activity = await this.db.activity.findUnique({ where: { id: input.activityId! }, select: { id: true, userId: true } });
    if (!activity || activity.userId !== actorUserId) throw new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
    const columns = feedbackColumns({ ...input, completion: null }, now);
    return this.db.athleteFeedback.upsert({
      where: { activityId: activity.id },
      create: { id: randomUUID(), activityId: activity.id, athleteId: actorUserId, ...columns },
      update: columns,
    });
  }

  private async forAssignment(actorUserId: string, input: z.infer<typeof sessionFeedbackSchema>, now: Date) {
    const assignment = await this.db.workoutAssignment.findUnique({
      where: { id: input.assignmentId! },
      select: {
        id: true, athleteId: true, status: true, coachId: true, schoolId: true, scheduledAt: true,
        workout: { select: { sportType: true } },
        athlete: { select: { name: true } },
        executions: { where: { matchStatus: { in: [...MATCHED] } }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!assignment || assignment.athleteId !== actorUserId) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
    if (assignment.status === "CANCELLED") throw new SchoolError("WORKOUT_ASSIGNMENT_CANCELLED", "Este treino foi cancelado.", 409);
    if (assignment.scheduledAt && assignment.scheduledAt > now && input.completion !== null) {
      throw new SchoolError("WORKOUT_ASSIGNMENT_IN_FUTURE", "Relate a execução depois do horário do treino.", 422);
    }
    const columns = feedbackColumns(input, now);

    const saved = await this.db.$transaction(async (tx) => {
      let executionId = assignment.executions[0]?.id ?? null;
      if (input.manual && !executionId) {
        // §18.3 — manual record of the prescribed session, author and origin identified.
        executionId = randomUUID();
        await tx.workoutExecution.create({
          data: {
            id: executionId, workoutAssignmentId: assignment.id, athleteId: actorUserId, source: "manual", externalId: randomUUID(),
            sportType: assignment.workout?.sportType ?? "default",
            startedAt: input.manual.startedAt ? new Date(input.manual.startedAt) : assignment.scheduledAt ?? now,
            durationSeconds: input.manual.durationMinutes ? Math.round(input.manual.durationMinutes * 60) : null,
            distanceMeters: input.manual.distanceMeters ?? null,
            matchScore: 100, matchStatus: "CONFIRMED",
            activityPayload: { source: "manual", authorUserId: actorUserId, recordedAt: now.toISOString() },
          },
        });
      }
      const existing = executionId
        ? await tx.athleteFeedback.findUnique({ where: { workoutExecutionId: executionId } })
        : await tx.athleteFeedback.findFirst({ where: { workoutAssignmentId: assignment.id, workoutExecutionId: null } });
      // A report made before the manual record/sync moves onto the execution.
      const orphan = executionId && !existing ? await tx.athleteFeedback.findFirst({ where: { workoutAssignmentId: assignment.id, workoutExecutionId: null } }) : null;
      const target = existing ?? orphan;
      const feedback = target
        ? await tx.athleteFeedback.update({ where: { id: target.id }, data: { ...columns, workoutExecutionId: executionId } })
        : await tx.athleteFeedback.create({ data: { id: randomUUID(), workoutAssignmentId: assignment.id, workoutExecutionId: executionId, athleteId: actorUserId, ...columns } });

      // The execution state follows the report; the prescription itself never changes (§19.1).
      const status = input.completion === "FULL" ? (executionId ? "COMPLETED" : null)
        : input.completion === "PARTIAL" ? "PARTIALLY_COMPLETED"
          : input.completion === "NOT_DONE" ? (input.adaptationReason ? "JUSTIFIED" : "MISSED")
            : null;
      if (status && status !== assignment.status) {
        await tx.workoutAssignment.update({ where: { id: assignment.id }, data: { status } });
        await tx.workoutAssignmentHistory.create({
          data: { id: randomUUID(), workoutAssignmentId: assignment.id, eventType: "ATHLETE_REPORTED", actorUserId, payload: { from: assignment.status, to: status, completion: input.completion, adaptationReason: input.adaptationReason, manual: Boolean(input.manual) }, createdAt: now },
        });
      }
      if (input.painReported) await this.warnPain(tx, assignment, input.painNote ?? "", actorUserId, now);
      return feedback;
    }, TX);
    return saved;
  }

  /** §7.1 FEEDBACK_PAIN_REPORTED — once per report, to the responsible coach only. */
  private async warnPain(tx: Prisma.TransactionClient, assignment: { id: string; athleteId: string; coachId: string | null; schoolId: string | null; athlete: { name: string | null } }, painNote: string, actorUserId: string, now: Date) {
    if (!assignment.coachId) return;
    const coach = await tx.coachProfile.findUnique({ where: { id: assignment.coachId }, select: { userId: true } });
    if (!coach || !await new CanReadAthleteCurrentData(tx as PrismaClient, () => now).execute(coach.userId, { athleteId: assignment.athleteId, schoolId: assignment.schoolId })) return;
    const href = assignment.schoolId
      ? `/professor/${assignment.schoolId}/atletas/${assignment.athleteId}/treinos/${assignment.id}`
      : `/professor/independente/atletas/${assignment.athleteId}/treinos/${assignment.id}`;
    const name = assignment.athlete.name ?? "atleta";
    await new NotificationService(tx, () => now).notify({
      userId: coach.userId, kind: "FEEDBACK_PAIN_REPORTED",
      title: `Relato de dor no treino de ${name}`,
      body: "Abra o relato e revise o plano. O aplicativo não é canal de emergência.",
      // One notice per reported pain on this session: re-sending the same report does not warn twice.
      href, dedupeKey: `pain:${assignment.id}:${createHash("sha256").update(painNote.trim().toLowerCase()).digest("hex").slice(0, 16)}`,
    });
    await raiseFollowUp(tx, now, {
      kind: "FEEDBACK_PAIN_REPORTED", sourceType: "WorkoutAssignment", sourceId: assignment.id, athleteId: assignment.athleteId,
      assigneeUserId: coach.userId, schoolId: assignment.schoolId, title: `Revisar relato de dor de ${name}`, href,
      dedupeKey: `pain-review:${assignment.id}`, priority: "HIGH", reason: "relato de dor/dificuldade relevante", actorUserId,
    });
  }
}

/** The report shown to the athlete and to the coach: one per prescription (via execution or not). */
export async function sessionFeedbackOf(db: Pick<PrismaClient, "athleteFeedback">, assignmentId: string) {
  return db.athleteFeedback.findFirst({
    where: { workoutAssignmentId: assignmentId },
    orderBy: { updatedAt: "desc" },
    select: {
      completion: true, rpe: true, rpeScale: true, rpeCollectedAt: true, difficulty: true, adaptationReason: true, adaptationNote: true,
      painReported: true, painNote: true, comment: true, attachmentUrl: true, updatedAt: true, mood: true, energy: true,
      execution: { select: { source: true } },
    },
  });
}

/** §17.4 — the prescription asks for RPE when one of its blocks has an RPE target. */
export function rpeRequestedBy(blocks: ReadonlyArray<{ targetPayload: unknown }>): boolean {
  return blocks.some((block) => typeof (block.targetPayload as { rpe?: unknown } | null)?.rpe === "number");
}

/**
 * What the detail screens show about the execution: the report, the derived
 * state (with the organization's sync window) and whether RPE was asked for.
 */
export async function sessionExecutionView(
  db: PrismaClient,
  assignment: { id: string; status: string; scheduledAt: Date | null; schoolId: string | null; coachId: string | null; hasMatchedExecution: boolean; blocks: ReadonlyArray<{ targetPayload: unknown }> },
  now: Date = new Date(),
) {
  const [feedback, policy] = await Promise.all([
    sessionFeedbackOf(db, assignment.id),
    loadFollowUpPolicy(db, { schoolId: assignment.schoolId, coachId: assignment.schoolId ? null : assignment.coachId }),
  ]);
  const state = deriveExecutionState({
    status: assignment.status, scheduledAt: assignment.scheduledAt, hasMatchedExecution: assignment.hasMatchedExecution,
    completion: (feedback?.completion ?? null) as "FULL" | "PARTIAL" | "NOT_DONE" | null, now, syncWindowHours: policy.syncWindowHours,
  });
  return { feedback, state, rpeRequested: rpeRequestedBy(assignment.blocks) };
}
