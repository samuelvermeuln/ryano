/**
 * T226 — CreateCoachEvaluation
 * T227 — UpdateCoachEvaluation
 * T228 — SubmitAthleteFeedback
 *
 * Three separate use cases governing the post-execution feedback loop:
 *  - A coach scores and annotates a confirmed execution.
 *  - A coach can update their own evaluation (score or note).
 *  - An athlete submits their RPE/mood/energy self-report.
 *
 * Score independence invariant (T231):
 *   CoachEvaluation.overallScore ≠ WorkoutCompliance.overallScore (ryvanoScore)
 *   Both are preserved and neither overwrites the other.
 *
 * Coach-change preservation invariant (T232):
 *   Evaluations are NOT deleted when a coach leaves the school because the
 *   FK is RESTRICT — the historical record is kept linked to the original coach.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createCoachEvaluation, coachScoreSchema } from "../domain/coach-evaluation";
import { createAthleteFeedback } from "../domain/athlete-feedback";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

// ---------------------------------------------------------------------------
// CreateCoachEvaluation (T226)
// ---------------------------------------------------------------------------

export const createCoachEvaluationSchema = z.strictObject({
  workoutExecutionId: id,
  schoolId: id,
  overallScore: coachScoreSchema,
  note: z.string().max(5000).optional(),
  isVisible: z.boolean().optional(),
});

export class CreateCoachEvaluation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = createCoachEvaluationSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, status: true } });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "Professor inativo.", 409);

        // Confirm coach is active in the school
        const membership = await tx.coachSchoolMembership.findFirst({
          where: { schoolId: input.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
        });
        if (!membership) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não está ativo nesta escola.", 403);

        const execution = await tx.workoutExecution.findUnique({
          where: { id: input.workoutExecutionId },
          select: { id: true, workoutAssignmentId: true, athleteId: true, matchStatus: true },
        });
        if (!execution) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

        const allowedStatuses: string[] = [WorkoutMatchStatus.CONFIRMED, WorkoutMatchStatus.OVERRIDDEN];
        if (!allowedStatuses.includes(execution.matchStatus)) {
          throw new SchoolError("EXECUTION_NOT_EVALUABLE", "Apenas execuções confirmadas podem ser avaliadas.", 409);
        }

        const now = this.clock();
        const evaluation = createCoachEvaluation({
          id: randomUUID(),
          workoutExecutionId: input.workoutExecutionId,
          workoutAssignmentId: execution.workoutAssignmentId,
          athleteId: execution.athleteId,
          coachId: coach.id,
          schoolId: input.schoolId,
          overallScore: input.overallScore,
          note: input.note ?? null,
          isVisible: input.isVisible ?? true,
        }, now);

        return tx.coachEvaluation.create({ data: evaluation });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("EVALUATION_ALREADY_EXISTS", "Você já avaliou esta execução. Use o endpoint de atualização.", 409);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// UpdateCoachEvaluation (T227)
// ---------------------------------------------------------------------------

export const updateCoachEvaluationSchema = z.strictObject({
  evaluationId: id,
  overallScore: coachScoreSchema.optional(),
  note: z.string().max(5000).nullable().optional(),
  isVisible: z.boolean().optional(),
}).refine((v) => v.overallScore !== undefined || v.note !== undefined || v.isVisible !== undefined, {
  message: "At least one field must be provided for update.",
});

export class UpdateCoachEvaluation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = updateCoachEvaluationSchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
      if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);

      const evaluation = await tx.coachEvaluation.findUnique({ where: { id: input.evaluationId }, select: { id: true, coachId: true } });
      if (!evaluation) throw new SchoolError("EVALUATION_NOT_FOUND", "Avaliação não encontrada.", 404);
      if (evaluation.coachId !== coach.id) throw new SchoolError("FORBIDDEN", "Apenas o professor que criou a avaliação pode editá-la.", 403);

      const now = this.clock();
      const data: Record<string, unknown> = { updatedAt: now };
      if (input.overallScore !== undefined) data.overallScore = input.overallScore;
      if (input.note !== undefined) data.note = input.note;
      if (input.isVisible !== undefined) data.isVisible = input.isVisible;

      return tx.coachEvaluation.update({ where: { id: input.evaluationId }, data });
    });
  }
}

// ---------------------------------------------------------------------------
// SubmitAthleteFeedback (T228)
// ---------------------------------------------------------------------------

export const submitAthleteFeedbackSchema = z.strictObject({
  workoutExecutionId: id,
  rpe: z.number().int().min(1).max(10),
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

export class SubmitAthleteFeedback {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = submitAthleteFeedbackSchema.parse(raw);

    const execution = await this.db.workoutExecution.findUnique({
      where: { id: input.workoutExecutionId },
      select: { id: true, workoutAssignmentId: true, athleteId: true, matchStatus: true },
    });
    if (!execution) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);
    if (execution.athleteId !== actor.data) throw new SchoolError("FORBIDDEN", "Você só pode enviar feedback das suas próprias execuções.", 403);

    const now = this.clock();
    const feedback = createAthleteFeedback({
      id: randomUUID(),
      workoutExecutionId: input.workoutExecutionId,
      workoutAssignmentId: execution.workoutAssignmentId,
      athleteId: execution.athleteId,
      rpe: input.rpe,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      comment: input.comment ?? null,
    }, now);

    // Upsert: athlete can update their feedback
    return this.db.athleteFeedback.upsert({
      where: { workoutExecutionId: input.workoutExecutionId },
      create: feedback,
      update: {
        rpe: feedback.rpe,
        mood: feedback.mood,
        energy: feedback.energy,
        comment: feedback.comment,
        updatedAt: now,
      },
    });
  }
}
