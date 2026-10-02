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
import {
  addCalendarDays,
  localMidnightToUtc,
  mondayOnOrBefore,
  todayLocalDate,
  utcToLocalDateTime,
  type LocalDate,
} from "../domain/local-date";
import { canEstimateHeartRateLoad, type HeartRateLoadParameters } from "../domain/training-load";
import { DONE_ASSIGNMENT_STATUSES } from "./athlete-training-scope";
import { loadAthleteSessions } from "./load-athlete-sessions";
import {
  prescriptionScope as scopeOfPrescriptions,
  technicalSheetScope,
  type CoachAthleteScopeInput,
} from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

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

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, raw: unknown = {}) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    const options = querySchema.parse(raw);
    const timeZone = context.timeZone;
    const sheetScope = technicalSheetScope(context, athleteId);

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
      ...scopeOfPrescriptions(context),
      createdAt: { gte: context.periodStart },
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      // Same modality field as the distribution: the execution's (SAM-20).
      ...(options.sportType ? { executions: { some: { sportType: options.sportType } } } : {}),
    };

    const [sessions, sheet, prescribedCount, doneCount, compliance] = await Promise.all([
      // Everything the athlete did (matched, self-logged, imported), both windows at once.
      loadAthleteSessions(this.db, {
        athleteId, schoolId: context.schoolId, coachId: context.coachId, periodStart: context.periodStart,
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
    };
  }
}
