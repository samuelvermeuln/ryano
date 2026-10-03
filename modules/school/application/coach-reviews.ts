/**
 * SAM-64 — the coach reviews a session or a preparation (§6 step 12, §19.2,
 * §21.1 Review, AC24).
 *
 * - Only the coach of the prescription (or of the preparation) who can still
 *   read the athlete now writes it; opening a notice or a task is not a review.
 * - A session is reviewable once there is a linked execution or the athlete's
 *   report (the same rule the "Revisar" button shows).
 * - Saving NEVER changes a prescription (AC23/§19.2): future changes go
 *   through publishing; `linkedAssignmentIds` only points at them.
 * - Editing keeps the previous content as a revision (authorship preserved).
 * - It closes the athlete's open "pedir revisão" and the open tasks of the
 *   source; the next review date schedules a REVIEW_DUE reminder.
 * - The athlete sees it when visible; their report stays as they wrote it.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { NotificationService } from "@/modules/shared/notifications";
import { athleteAssignmentHref, REVIEW_DECISIONS } from "../domain/coach-review";
import { SchoolError } from "../domain/errors";
import { isValidLocalDate, localDateTimeToUtc } from "../domain/local-date";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";
import { loadFollowUpPolicy } from "./follow-up-reminders";
import { resolveOpenFollowUps } from "./follow-up-tasks";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";

type Tx = Prisma.TransactionClient;
type Clock = () => Date;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;
const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
export const REVIEW_REMINDER_TIME = "09:00";

export const saveCoachReviewSchema = z.strictObject({
  target: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("assignment"), assignmentId: id }),
    z.strictObject({ type: z.literal("preparation"), preparationId: id }),
  ]),
  observation: z.string().trim().min(1, "Escreva a observação técnica.").max(5000),
  decision: z.enum(REVIEW_DECISIONS),
  justification: z.string().trim().max(2000).nullish().transform((v) => (v ? v : null)),
  nextReviewLocalDate: z.string().nullish().transform((v) => (v ? v : null)).refine((v) => v === null || isValidLocalDate(v), "Data da próxima revisão inválida."),
  linkedAssignmentIds: z.array(id).max(50).default([]).transform((ids) => [...new Set(ids)]),
  isVisible: z.boolean().default(true),
}).superRefine((input, ctx) => {
  if (input.decision !== "KEEP" && input.decision !== "NONE" && !input.justification) {
    ctx.addIssue({ code: "custom", path: ["justification"], message: "Justifique a decisão." });
  }
});

type ReviewTarget = {
  type: "ASSIGNMENT" | "PREPARATION";
  assignmentId: string | null;
  preparationId: string | null;
  athleteId: string;
  coachId: string;
  schoolId: string | null;
};

export class SaveCoachReview {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = saveCoachReviewSchema.parse(raw);
    return this.db.$transaction((tx) => this.save(tx, actorUserId, input), TX);
  }

  private async target(tx: Tx, actorUserId: string, input: z.infer<typeof saveCoachReviewSchema>, now: Date): Promise<ReviewTarget> {
    const coach = await tx.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    if (!coach) throw new SchoolError("FORBIDDEN", "Apenas o professor revisa.", 403);
    let target: ReviewTarget;
    if (input.target.type === "assignment") {
      const assignment = await tx.workoutAssignment.findUnique({
        where: { id: input.target.assignmentId },
        select: {
          id: true, athleteId: true, coachId: true, schoolId: true, status: true,
          executions: { where: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, select: { id: true }, take: 1 },
        },
      });
      if (!assignment) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
      if (assignment.coachId !== coach.id) throw new SchoolError("FORBIDDEN", "Só o professor desta prescrição a revisa.", 403);
      const report = await tx.athleteFeedback.findFirst({ where: { workoutAssignmentId: assignment.id, completion: { not: null } }, select: { id: true } });
      if (assignment.executions.length === 0 && !report) {
        throw new SchoolError("REVIEW_NOT_YET", "Revise depois que houver atividade vinculada ou o relato do aluno.", 409);
      }
      target = { type: "ASSIGNMENT", assignmentId: assignment.id, preparationId: null, athleteId: assignment.athleteId, coachId: coach.id, schoolId: assignment.schoolId };
    } else {
      const preparation = await tx.eventPreparation.findUnique({
        where: { id: input.target.preparationId },
        select: { id: true, coachId: true, schoolId: true, participation: { select: { athleteId: true } } },
      });
      if (!preparation) throw new SchoolError("PREPARATION_NOT_FOUND", "Preparação não encontrada.", 404);
      if (preparation.coachId !== coach.id) throw new SchoolError("FORBIDDEN", "Só o professor responsável revisa esta preparação.", 403);
      target = { type: "PREPARATION", assignmentId: null, preparationId: preparation.id, athleteId: preparation.participation.athleteId, coachId: coach.id, schoolId: preparation.schoolId };
    }
    if (!await new CanReadAthleteCurrentData(tx as PrismaClient, () => now).execute(actorUserId, { athleteId: target.athleteId, schoolId: target.schoolId })) {
      throw new SchoolError("FORBIDDEN", "Você não acompanha mais este aluno.", 403);
    }
    return target;
  }

  private async save(tx: Tx, actorUserId: string, input: z.infer<typeof saveCoachReviewSchema>) {
    const now = this.clock();
    const target = await this.target(tx, actorUserId, input, now);

    if (input.linkedAssignmentIds.length > 0) {
      // Links point at changes already published by the coach for this athlete; nothing is created here.
      const found = await tx.workoutAssignment.count({ where: { id: { in: input.linkedAssignmentIds }, athleteId: target.athleteId } });
      if (found !== input.linkedAssignmentIds.length) throw new SchoolError("VALIDATION_ERROR", "Uma das sessões ligadas não é deste aluno.", 422);
    }

    const content = {
      observation: input.observation, decision: input.decision, justification: input.justification,
      nextReviewLocalDate: input.nextReviewLocalDate, linkedAssignmentIds: input.linkedAssignmentIds, isVisible: input.isVisible,
    };
    const existing = target.assignmentId
      ? await tx.coachReview.findFirst({ where: { workoutAssignmentId: target.assignmentId } })
      : null;
    let review;
    if (existing) {
      await tx.coachReviewRevision.create({
        data: {
          id: randomUUID(), reviewId: existing.id, version: existing.version, editedByUserId: actorUserId, createdAt: now,
          snapshot: {
            observation: existing.observation, decision: existing.decision, justification: existing.justification,
            nextReviewLocalDate: existing.nextReviewLocalDate, linkedAssignmentIds: existing.linkedAssignmentIds,
            isVisible: existing.isVisible, authorUserId: existing.authorUserId, updatedAt: existing.updatedAt.toISOString(),
          },
        },
      });
      review = await tx.coachReview.update({ where: { id: existing.id }, data: { ...content, version: { increment: 1 }, updatedAt: now } });
    } else {
      review = await tx.coachReview.create({
        data: {
          id: randomUUID(), targetType: target.type, workoutAssignmentId: target.assignmentId, eventPreparationId: target.preparationId,
          athleteId: target.athleteId, coachId: target.coachId, schoolId: target.schoolId, authorUserId: actorUserId,
          ...content, createdAt: now, updatedAt: now,
        },
      });
    }

    // What the review answers is closed; the review itself changes no prescription.
    if (target.assignmentId) {
      await tx.workoutAssignmentComment.updateMany({
        where: { workoutAssignmentId: target.assignmentId, kind: "REVIEW_REQUEST", resolvedAt: null },
        data: { resolvedAt: now, resolvedBy: actorUserId },
      });
      await resolveOpenFollowUps(tx, now, "WorkoutAssignment", target.assignmentId, actorUserId, "sessão revisada pelo professor");
      if (input.isVisible) {
        await new NotificationService(tx, () => now).notify({
          userId: target.athleteId, kind: "WORKOUT_REVIEWED",
          title: "Seu professor revisou o treino",
          body: "Abra o treino para ler o parecer.",
          href: athleteAssignmentHref(target.schoolId, target.assignmentId),
          dedupeKey: `review:${review.id}:v${review.version}`,
        });
      }
    } else if (target.preparationId) {
      await resolveOpenFollowUps(tx, now, "EventPreparation", target.preparationId, actorUserId, "preparação revisada pelo professor");
    }
    await this.scheduleNextReview(tx, review, existing?.nextReviewLocalDate ?? null, target, now);
    return review;
  }

  /** The next review date becomes a REVIEW_DUE reminder to the coach; changing the date replaces it. */
  private async scheduleNextReview(tx: Tx, review: { id: string; nextReviewLocalDate: string | null; athleteId: string }, previousDate: string | null, target: ReviewTarget, now: Date) {
    if (previousDate === review.nextReviewLocalDate && previousDate !== null) return;
    await tx.scheduledReminder.updateMany({
      where: { sourceType: "CoachReview", sourceId: review.id, status: "PENDING" },
      data: { status: "CANCELLED", updatedAt: now },
    });
    if (!review.nextReviewLocalDate) return;
    const policy = await loadFollowUpPolicy(tx, { schoolId: target.schoolId, coachId: target.schoolId ? null : target.coachId });
    const dueAt = localDateTimeToUtc(`${review.nextReviewLocalDate}T${REVIEW_REMINDER_TIME}`, policy.timeZone);
    if (dueAt <= now) return;
    await tx.scheduledReminder.createMany({
      data: [{
        id: randomUUID(), kind: "REVIEW_DUE", sourceType: "CoachReview", sourceId: review.id, athleteId: review.athleteId,
        audience: "RESPONSIBLE", dueAt, payload: { dueLocalDate: review.nextReviewLocalDate },
        dedupeKey: `review-due:${review.id}:${review.nextReviewLocalDate}`, createdAt: now, updatedAt: now,
      }],
      skipDuplicates: true,
    });
  }
}

/** The review of a session as the screens read it; `visibleOnly` for the athlete. */
export async function reviewOfAssignment(db: Pick<PrismaClient, "coachReview">, assignmentId: string, options: { visibleOnly: boolean }) {
  return db.coachReview.findFirst({
    where: { workoutAssignmentId: assignmentId, ...(options.visibleOnly ? { isVisible: true } : {}) },
    select: {
      id: true, observation: true, decision: true, justification: true, nextReviewLocalDate: true, linkedAssignmentIds: true,
      isVisible: true, version: true, createdAt: true, updatedAt: true, author: { select: { name: true } },
    },
  });
}

/** Which of these sessions already have a review (the "revisado" badge). */
export async function reviewedAssignmentIds(db: Pick<PrismaClient, "coachReview">, assignmentIds: readonly string[]) {
  if (assignmentIds.length === 0) return new Set<string>();
  const rows = await db.coachReview.findMany({ where: { workoutAssignmentId: { in: [...assignmentIds] } }, select: { workoutAssignmentId: true } });
  return new Set(rows.map((row) => row.workoutAssignmentId!));
}
