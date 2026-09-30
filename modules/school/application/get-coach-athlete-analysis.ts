/**
 * Longitudinal analysis of one athlete: weekly volume, consistency, modality
 * distribution and adherence over a chosen window.
 *
 * Every number here is an aggregate of data that already exists:
 *
 * - volume (sessions, duration, distance) comes from **matched executions**, not
 *   from prescriptions, because a skipped prescription is not volume;
 * - adherence is the average of the stored `WorkoutCompliance.overallScore`,
 *   whose formula lives in `CalculateWorkoutCompliance` and is not recomputed here;
 * - consistency is "weeks with at least one executed session ÷ weeks in the
 *   window", stated in those terms in the returned shape so the screen can label
 *   it honestly.
 *
 * What is **not** here, on purpose: no CTL/ATL/TSB or any other training-load
 * model. Those need per-second streams or a documented TSS-equivalent, and this
 * codebase stores neither (`Activity` keeps summary fields only; there is no
 * stream cache — see the note in prisma/schema.prisma). Naming such a metric
 * without its methodology would be a number the coach cannot act on, so the gap
 * is recorded instead of filled.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import {
  DONE_ASSIGNMENT_STATUSES,
  MATCHED_EXECUTION_STATUSES,
  startOfUtcDay,
} from "./athlete-training-scope";
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

export type AnalysisWeek = {
  /** Monday of the week, UTC. */
  weekStart: Date;
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
};

export type AnalysisSportSlice = {
  sportType: string;
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
};

/** Monday-anchored, so weeks line up with how coaches plan. */
function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day.
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export class GetCoachAthleteAnalysis {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, raw: unknown = {}) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, schoolId, athleteId);
    const options = querySchema.parse(raw);

    const today = startOfUtcDay(this.clock());
    const requestedFrom = startOfUtcWeek(addUtcDays(today, -(options.windowDays - 1)));
    // Never reach past the current membership period: an earlier stay needs the
    // athlete's own consent (ADR-005).
    const from = requestedFrom < context.periodStart ? startOfUtcWeek(context.periodStart) : requestedFrom;
    const clampedToPeriod = requestedFrom < context.periodStart;

    const assignmentScope: Prisma.WorkoutAssignmentWhereInput = {
      schoolId: context.schoolId,
      createdAt: { gte: context.periodStart },
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      ...(options.sportType ? { workout: { sportType: options.sportType } } : {}),
    };

    const [executions, prescribedCount, doneCount, compliance, sportRows] = await Promise.all([
      this.db.workoutExecution.findMany({
        where: {
          athleteId,
          matchStatus: { in: MATCHED_EXECUTION_STATUSES },
          startedAt: { gte: from },
          assignment: assignmentScope,
        },
        select: { startedAt: true, durationSeconds: true, distanceMeters: true, sportType: true },
        // Bounded: one athlete's executions inside one membership period and one
        // window, never the whole history.
        orderBy: { startedAt: "asc" },
      }),
      this.db.workoutAssignment.count({
        where: { AND: [assignmentScope, { athleteId, scheduledAt: { gte: from, lt: addUtcDays(today, 1) } }] },
      }),
      this.db.workoutAssignment.count({
        where: {
          AND: [
            assignmentScope,
            {
              athleteId,
              scheduledAt: { gte: from, lt: addUtcDays(today, 1) },
              status: { in: DONE_ASSIGNMENT_STATUSES },
            },
          ],
        },
      }),
      this.db.workoutCompliance.aggregate({
        where: {
          athleteId,
          calculatedAt: { gte: from },
          assignment: assignmentScope,
        },
        _avg: { overallScore: true },
        _count: { _all: true },
      }),
      this.db.workoutAssignment.findMany({
        where: {
          schoolId: context.schoolId,
          athleteId,
          status: { not: WorkoutAssignmentStatus.UNPLANNED },
          createdAt: { gte: context.periodStart },
          workout: { isNot: null },
        },
        select: { workout: { select: { sportType: true } } },
        distinct: ["workoutId"],
        take: 200,
      }),
    ]);

    const weeks = new Map<number, AnalysisWeek>();
    for (let cursor = new Date(from); cursor <= today; cursor = addUtcDays(cursor, 7)) {
      weeks.set(cursor.getTime(), {
        weekStart: new Date(cursor),
        sessions: 0,
        durationSeconds: 0,
        distanceMeters: 0,
      });
    }

    const bySport = new Map<string, AnalysisSportSlice>();
    for (const execution of executions) {
      const week = weeks.get(startOfUtcWeek(execution.startedAt).getTime());
      if (week) {
        week.sessions += 1;
        week.durationSeconds += execution.durationSeconds ?? 0;
        week.distanceMeters += execution.distanceMeters ?? 0;
      }
      const slice = bySport.get(execution.sportType) ?? {
        sportType: execution.sportType,
        sessions: 0,
        durationSeconds: 0,
        distanceMeters: 0,
      };
      slice.sessions += 1;
      slice.durationSeconds += execution.durationSeconds ?? 0;
      slice.distanceMeters += execution.distanceMeters ?? 0;
      bySport.set(execution.sportType, slice);
    }

    const weekList = [...weeks.values()];
    const activeWeeks = weekList.filter((week) => week.sessions > 0).length;

    return {
      context,
      windowDays: options.windowDays,
      sportType: options.sportType ?? null,
      availableSportTypes: [...new Set(
        sportRows.map((row) => row.workout?.sportType).filter((sport): sport is string => Boolean(sport)),
      )].sort(),
      from,
      /** True when the window was shortened to the current membership period. */
      clampedToPeriod,
      weeks: weekList,
      bySport: [...bySport.values()].sort((a, b) => b.durationSeconds - a.durationSeconds),
      totals: {
        sessions: executions.length,
        durationSeconds: weekList.reduce((sum, week) => sum + week.durationSeconds, 0),
        distanceMeters: weekList.reduce((sum, week) => sum + week.distanceMeters, 0),
      },
      consistency: { activeWeeks, totalWeeks: weekList.length },
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
