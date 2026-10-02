/**
 * Longitudinal analysis of one athlete: weekly volume (prescribed and not),
 * consistency, modality distribution and trends, adherence, and heart-rate
 * load — over a chosen window, in the school's calendar.
 *
 * Every number here is an aggregate of data that already exists:
 *
 * - volume counts **everything the athlete did** (SAM-20): executions matched
 *   to a prescription, sessions the athlete logged without one (UNPLANNED),
 *   and imported activities nobody matched. The screen keeps "prescribed" and
 *   "unprescribed" apart; adherence is a separate layer, as Strava,
 *   TrainingPeaks and Intervals.icu do it;
 * - weeks are Monday-anchored **local** weeks in the school's zone
 *   (`School.timezone`, SAM-16): a Sunday 22:00 session in Brasília stays in
 *   its week;
 * - adherence is the average of the stored `WorkoutCompliance.overallScore`,
 *   whose formula lives in `CalculateWorkoutCompliance` and is not recomputed here;
 * - heart-rate load is the hrTSS approximation of ADR-007, only when the sheet
 *   has resting, threshold and maximum heart rate;
 * - consistency is "weeks with at least one session ÷ weeks in the window".
 *
 * What is **not** here, on purpose: CTL/ATL/TSB. They need a continuous daily
 * series longer than these windows; the gap is stated, not filled.
 *
 * Consent (ADR-005): nothing before the athlete's current membership period is
 * read, for any source — an earlier stay is a different consent question.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { aggregateBySport, aggregateWeeks, summarizeWindow } from "../domain/athlete-analysis";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import {
  addCalendarDays,
  localMidnightToUtc,
  mondayOnOrBefore,
  todayLocalDate,
  utcToLocalDateTime,
  type LocalDate,
} from "../domain/local-date";
import { canEstimateHeartRateLoad, type HeartRateLoadParameters } from "../domain/training-load";
import {
  buildActivityPoints,
  plannedDurationOfBlocks,
  summarizeAdherence,
  type SessionExtras,
} from "../domain/athlete-evolution";
import { derivePrescriptionOutcome } from "../domain/prescription-outcome";
import { ResolveActivityReaderContext, type ActivityReaderScopeInput } from "./activity-reader-context";
import { DONE_ASSIGNMENT_STATUSES, MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";
import { loadAthleteSessions } from "./load-athlete-sessions";
import {
  prescriptionScope as scopeOfPrescriptions,
  technicalSheetScope,
  type ScopedContext,
} from "./coach-athlete-scope";

export const ANALYSIS_WINDOWS = [28, 84, 168] as const;
export type AnalysisWindowDays = (typeof ANALYSIS_WINDOWS)[number];

const querySchema = z.strictObject({
  windowDays: z.coerce.number().int().refine(
    (value): value is AnalysisWindowDays => (ANALYSIS_WINDOWS as readonly number[]).includes(value),
    "Janela de análise inválida.",
  ).default(84),
  sportType: z.string().trim().min(1).max(100).optional(),
});

export type { AnalysisWeek, SportTrend, WindowSummary } from "../domain/athlete-analysis";

export class GetCoachAthleteAnalysis {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /**
   * `scope`: a school id or `{ kind: "independent" }` for a coach, or
   * `{ kind: "school-admin", schoolId }` for the school's administration (SAM-44):
   * the administration reads the school's prescriptions, so the scope helpers
   * only ever see a school id for it.
   */
  async execute(actorUserId: string | null, scope: ActivityReaderScopeInput, athleteId: string, raw: unknown = {}) {
    const context = await new ResolveActivityReaderContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    if (context.reader === "athlete") {
      throw new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado.", 404);
    }
    const options = querySchema.parse(raw);
    const timeZone = context.timeZone;
    const scoped: ScopedContext = { schoolId: context.schoolId, coachId: context.coachId ?? "" };
    const sheetScope = technicalSheetScope(scoped, athleteId);

    // Local calendar math in the school's zone (SAM-16): the window ends with
    // the current local week and starts `windowDays` back, snapped to Monday.
    const today = todayLocalDate(this.clock(), timeZone);
    const weekEnd = addCalendarDays(mondayOnOrBefore(today), 7); // exclusive
    const requestedFrom = mondayOnOrBefore(addCalendarDays(today, -(options.windowDays - 1)));
    // Never reach past the current membership period (ADR-005).
    const periodStartLocal = utcToLocalDateTime(context.periodStart, timeZone).date;
    const clampedToPeriod = requestedFrom < periodStartLocal;
    const from: LocalDate = clampedToPeriod ? mondayOnOrBefore(periodStartLocal) : requestedFrom;
    // The previous window of the same length, for the comparison.
    const previousFrom = addCalendarDays(from, -(options.windowDays));
    const previousFromClamped = previousFrom < periodStartLocal ? null : previousFrom;

    const windowStart = localMidnightToUtc(from, timeZone);
    const windowEnd = localMidnightToUtc(weekEnd, timeZone);
    const readFrom = localMidnightToUtc(previousFromClamped ?? from, timeZone);

    const prescriptionScope: Prisma.WorkoutAssignmentWhereInput = {
      ...scopeOfPrescriptions(scoped),
      createdAt: { gte: context.periodStart },
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      // Same modality field as the distribution: the execution's (SAM-20).
      ...(options.sportType ? { executions: { some: { sportType: options.sportType } } } : {}),
    };

    const [sessions, sheet, prescribedCount, doneCount, compliance, prescriptions] = await Promise.all([
      // Everything the athlete did (matched, self-logged, imported), both windows at once.
      loadAthleteSessions(this.db, {
        athleteId, schoolId: context.schoolId, coachId: context.coachId ?? undefined, periodStart: context.periodStart,
        from: readFrom, until: windowEnd, ...(options.sportType ? { sportType: options.sportType } : {}),
      }),
      sheetScope.kind === "school"
        ? this.db.athleteTechnicalSheet.findUnique({
          where: { schoolId_athleteId: sheetScope.where },
          select: { restingHeartRate: true, thresholdHeartRate: true, maxHeartRate: true },
        })
        : this.db.athleteTechnicalSheet.findFirst({
          where: sheetScope.where,
          select: { restingHeartRate: true, thresholdHeartRate: true, maxHeartRate: true },
        }),
      this.db.workoutAssignment.count({
        where: { AND: [prescriptionScope, { athleteId, scheduledAt: { gte: windowStart, lt: windowEnd } }] },
      }),
      this.db.workoutAssignment.count({
        where: {
          AND: [
            prescriptionScope,
            { athleteId, scheduledAt: { gte: windowStart, lt: windowEnd }, status: { in: DONE_ASSIGNMENT_STATUSES } },
          ],
        },
      }),
      this.db.workoutCompliance.aggregate({
        where: { athleteId, calculatedAt: { gte: windowStart }, assignment: prescriptionScope },
        _avg: { overallScore: true },
        _count: { _all: true },
      }),
      // SAM-44 — the window's prescriptions with their plan and matched execution, for the expanded adherence.
      this.db.workoutAssignment.findMany({
        where: { AND: [prescriptionScope, { athleteId, scheduledAt: { gte: windowStart, lt: windowEnd } }] },
        select: {
          status: true,
          workout: { select: { sportType: true, blocks: { select: { durationS: true, repetitions: true } } } },
          executions: {
            where: { matchStatus: { in: MATCHED_EXECUTION_STATUSES } },
            select: { sportType: true, durationSeconds: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    ]);

    const loadParams: HeartRateLoadParameters = {
      restingHeartRate: sheet?.restingHeartRate ?? null,
      thresholdHeartRate: sheet?.thresholdHeartRate ?? null,
      maxHeartRate: sheet?.maxHeartRate ?? null,
    };

    const inWindow = sessions.filter((session) => session.startedAt >= windowStart && session.startedAt < windowEnd);
    const inPrevious = previousFromClamped
      ? sessions.filter((session) => session.startedAt >= readFrom && session.startedAt < windowStart)
      : null;

    const weeks = aggregateWeeks(inWindow, from, weekEnd, timeZone, loadParams);
    const activeWeeks = weeks.filter((week) => week.total.sessions > 0).length;

    // SAM-44 — per-activity points: the rich stats of the import (SAM-38), the
    // athlete's RPE and the prescribed × executed outcome of each session.
    const extras = await this.loadSessionExtras(inWindow.map((session) => session.id));
    const activities = buildActivityPoints(inWindow, extras, timeZone, loadParams);
    const adherenceDetail = summarizeAdherence(
      prescriptions.map((row) => ({
        status: row.status,
        workoutSportType: row.workout?.sportType ?? null,
        plannedDurationSeconds: plannedDurationOfBlocks(row.workout?.blocks),
        matchedExecution: row.executions[0] ? { sportType: row.executions[0].sportType, durationSeconds: row.executions[0].durationSeconds } : null,
      })),
      weeks.length,
    );

    return {
      context,
      timeZone,
      windowDays: options.windowDays,
      sportType: options.sportType ?? null,
      /** Modalities seen across every source in the window, the same field the filter applies to. */
      availableSportTypes: [...new Set(sessions.map((session) => session.sportType))].sort(),
      from,
      weekEnd,
      /** True when the window was shortened to the current membership period. */
      clampedToPeriod,
      weeks,
      bySport: aggregateBySport(inWindow),
      totals: summarizeWindow(inWindow, loadParams),
      /** The previous window of the same length; null when it would predate the membership. */
      previous: inPrevious ? summarizeWindow(inPrevious, loadParams) : null,
      consistency: { activeWeeks, totalWeeks: weeks.length },
      /** True when the sheet has the three heart rates the hrTSS estimate needs (ADR-007). */
      heartRateLoadAvailable: canEstimateHeartRateLoad(loadParams),
      adherence: {
        /** Prescriptions scheduled inside the window and how many reached a done state. */
        prescribed: prescribedCount,
        done: doneCount,
        /** Average of the stored compliance scores (0–100), or null when none were calculated. */
        averageComplianceScore: compliance._avg.overallScore,
        scoredCount: compliance._count._all,
      },
      /** SAM-44 — one point per session of the window, oldest first. */
      activities,
      /** SAM-44 — conforme × diferente × parcial × não executado; volume e frequência planejados × reais. */
      adherenceDetail,
    };
  }

  /** The rich stats, RPE and outcome behind each session id (`activity:<id>` / `execution:<id>`). */
  private async loadSessionExtras(sessionIds: readonly string[]): Promise<Map<string, SessionExtras>> {
    const activityIds = sessionIds.filter((id) => id.startsWith("activity:")).map((id) => id.slice("activity:".length));
    const executionIds = sessionIds.filter((id) => id.startsWith("execution:")).map((id) => id.slice("execution:".length));
    const extras = new Map<string, SessionExtras>();
    if (activityIds.length === 0 && executionIds.length === 0) return extras;

    const [activities, executions, feedbacks] = await Promise.all([
      activityIds.length > 0
        ? this.db.activity.findMany({
          where: { id: { in: activityIds } },
          select: { id: true, maxHeartRate: true, averageStrokeRate: true, averageDistancePerStroke: true, averageSwolf: true },
        })
        : Promise.resolve([]),
      executionIds.length > 0
        ? this.db.workoutExecution.findMany({
          where: { id: { in: executionIds } },
          select: {
            id: true, sportType: true, activityId: true,
            assignment: { select: { status: true, workout: { select: { sportType: true } } } },
            activity: { select: { maxHeartRate: true, averageStrokeRate: true, averageDistancePerStroke: true, averageSwolf: true } },
          },
        })
        : Promise.resolve([]),
      this.db.athleteFeedback.findMany({
        where: { OR: [
          ...(executionIds.length > 0 ? [{ workoutExecutionId: { in: executionIds } }] : []),
          ...(activityIds.length > 0 ? [{ activityId: { in: activityIds } }] : []),
        ] },
        select: { workoutExecutionId: true, activityId: true, rpe: true },
      }),
    ]);

    const rpeByExecution = new Map(feedbacks.filter((row) => row.workoutExecutionId).map((row) => [row.workoutExecutionId!, row.rpe]));
    const rpeByActivity = new Map(feedbacks.filter((row) => row.activityId).map((row) => [row.activityId!, row.rpe]));

    for (const activity of activities) {
      extras.set(`activity:${activity.id}`, {
        activityId: activity.id,
        rpe: rpeByActivity.get(activity.id) ?? null,
        maxHeartRate: activity.maxHeartRate,
        strokeRate: activity.averageStrokeRate,
        distancePerStroke: activity.averageDistancePerStroke,
        swolf: activity.averageSwolf,
      });
    }
    for (const execution of executions) {
      extras.set(`execution:${execution.id}`, {
        activityId: execution.activityId,
        outcome: derivePrescriptionOutcome({
          assignmentStatus: execution.assignment.status,
          workoutSportType: execution.assignment.workout?.sportType ?? null,
          matchedExecution: { sportType: execution.sportType },
        }),
        rpe: rpeByExecution.get(execution.id) ?? (execution.activityId ? rpeByActivity.get(execution.activityId) ?? null : null),
        maxHeartRate: execution.activity?.maxHeartRate ?? null,
        strokeRate: execution.activity?.averageStrokeRate ?? null,
        distancePerStroke: execution.activity?.averageDistancePerStroke ?? null,
        swolf: execution.activity?.averageSwolf ?? null,
      });
    }
    return extras;
  }
}
