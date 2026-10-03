/**
 * SAM-65 — the open-water view of a prescription for both detail screens:
 * the session context written with the version, the athlete's technical
 * feedback, the GPS honesty check, comparability with the previous
 * open-water session of the same athlete and the technical-task status.
 * The caller has already authorized the reader for this assignment.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { combineExecutions } from "../domain/execution-combination";
import { OPEN_WATER_SPORT, openWaterFeedbackSchema, openWaterSessionSchema, openWaterWarnings } from "../domain/open-water-session";
import { describeOpenWaterFeedback, gpsQuality, openWaterComparability, technicalTaskStatus } from "../presentation/open-water-analysis";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";

function technicalOf(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { kind, ...rest } = value as Record<string, unknown>;
  if (kind !== "open-water") return null;
  const parsed = openWaterFeedbackSchema.safeParse(rest);
  return parsed.success ? parsed.data : null;
}

async function sideOf(db: PrismaClient, assignmentId: string) {
  const [executions, feedback] = await Promise.all([
    db.workoutExecution.findMany({
      where: { workoutAssignmentId: assignmentId, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } },
      select: { id: true, startedAt: true, durationSeconds: true, distanceMeters: true },
    }),
    db.athleteFeedback.findFirst({ where: { workoutAssignmentId: assignmentId }, orderBy: { updatedAt: "desc" }, select: { technical: true, completion: true } }),
  ]);
  return { combined: combineExecutions(executions), feedback, technical: technicalOf(feedback?.technical) };
}

export async function loadOpenWaterView(db: PrismaClient, assignmentId: string) {
  const assignment = await db.workoutAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, athleteId: true, scheduledAt: true, workout: { select: { sportType: true, sessionContext: true } } },
  });
  if (!assignment?.workout) return null;
  const parsed = assignment.workout.sessionContext ? openWaterSessionSchema.safeParse(assignment.workout.sessionContext) : null;
  const context = parsed?.success ? parsed.data : null;
  if (assignment.workout.sportType !== OPEN_WATER_SPORT && !context) return null;

  const [current, review, previousRow] = await Promise.all([
    sideOf(db, assignment.id),
    db.coachReview.findFirst({ where: { workoutAssignmentId: assignment.id }, select: { id: true } }),
    db.workoutAssignment.findFirst({
      where: {
        athleteId: assignment.athleteId, id: { not: assignment.id }, status: { not: "CANCELLED" },
        ...(assignment.scheduledAt ? { scheduledAt: { lt: assignment.scheduledAt } } : {}),
        workout: { sessionContext: { not: Prisma.AnyNull } },
      },
      orderBy: { scheduledAt: "desc" },
      select: { id: true, workout: { select: { sessionContext: true } } },
    }),
  ]);
  let comparison = null;
  if (previousRow) {
    const previous = await sideOf(db, previousRow.id);
    const previousContext = openWaterSessionSchema.safeParse(previousRow.workout?.sessionContext);
    if (previous.combined || previous.technical) {
      comparison = openWaterComparability(
        { context, observedConditions: current.technical?.observedConditions ?? null, durationSeconds: current.combined?.durationSeconds ?? null },
        { context: previousContext.success ? previousContext.data : null, observedConditions: previous.technical?.observedConditions ?? null, durationSeconds: previous.combined?.durationSeconds ?? null },
      );
    }
  }
  const hasExecutionOrReport = current.combined !== null || Boolean(current.feedback?.completion);
  return {
    context,
    warnings: context ? openWaterWarnings(context) : [],
    realizedDurationSeconds: current.combined?.durationSeconds ?? null,
    gps: gpsQuality(current.combined ? { durationSeconds: current.combined.durationSeconds, distanceMeters: current.combined.distanceMeters } : null),
    feedbackLines: describeOpenWaterFeedback(current.technical),
    comparison,
    technicalTask: technicalTaskStatus({ hasExecutionOrReport, reviewed: review !== null }),
  };
}

export type OpenWaterView = NonNullable<Awaited<ReturnType<typeof loadOpenWaterView>>>;
