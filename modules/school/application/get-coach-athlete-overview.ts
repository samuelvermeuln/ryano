/**
 * The athlete's summary screen for the coach: who they are, what comes next,
 * what just happened, and this week against the previous one.
 *
 * Deliberately light — it is the landing screen. Charts, the full prescription
 * list and the interaction history each have their own route and their own use
 * case, so opening the summary never pays for data the coach has not asked for.
 * The reads here are bounded: one page of recent work, one upcoming row, and
 * aggregates over a fourteen-day window.
 */
import type { PrismaClient } from "@prisma/client";
import { WorkoutAssignmentStatus } from "../domain/enums";
import {
  assignmentFilterWhere,
  isAssignmentOverdue,
  MATCHED_EXECUTION_STATUSES,
  OPEN_CHANGE_REQUEST_STATUSES,
  startOfUtcDay,
  ATHLETE_TRAINING_FILTERS,
} from "./athlete-training-scope";
import { ResolveCoachAthleteContext, type CoachAthleteContext } from "./resolve-coach-athlete-context";

const RECENT_LIMIT = 5;
/** One week, compared against the week before it. */
const WEEK_DAYS = 7;

export type AthleteOverviewWorkoutRow = {
  id: string;
  title: string;
  sportType: string | null;
  scheduledAt: Date | null;
  status: string;
  overdue: boolean;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  execution: {
    startedAt: Date;
    durationSeconds: number | null;
    distanceMeters: number | null;
    complianceScore: number | null;
    rpe: number | null;
  } | null;
};

export type AthleteWeekVolume = {
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
};

function daysBefore(day: Date, days: number): Date {
  const copy = new Date(day);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

const ROW_SELECT = {
  id: true,
  scheduledAt: true,
  status: true,
  sourceLabel: true,
  workout: {
    select: {
      title: true,
      sportType: true,
      blocks: { select: { durationS: true, distanceM: true } },
    },
  },
  executions: {
    where: { matchStatus: { in: MATCHED_EXECUTION_STATUSES } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      startedAt: true,
      durationSeconds: true,
      distanceMeters: true,
      compliance: { select: { overallScore: true } },
      feedback: { select: { rpe: true } },
    },
  },
} as const;

type Row = {
  id: string;
  scheduledAt: Date | null;
  status: string;
  sourceLabel: string | null;
  workout: {
    title: string;
    sportType: string;
    blocks: Array<{ durationS: number | null; distanceM: unknown }>;
  } | null;
  executions: Array<{
    startedAt: Date;
    durationSeconds: number | null;
    distanceMeters: number | null;
    compliance: { overallScore: number } | null;
    feedback: { rpe: number } | null;
  }>;
};

/** Prescribed totals come from the block structure, the same way every other screen reads them. */
function toRow(row: Row, today: Date): AthleteOverviewWorkoutRow {
  const blocks = row.workout?.blocks ?? [];
  const execution = row.executions[0] ?? null;
  return {
    id: row.id,
    title: row.workout?.title ?? row.sourceLabel ?? "Treino agendado",
    sportType: row.workout?.sportType ?? null,
    scheduledAt: row.scheduledAt,
    status: row.status,
    overdue: isAssignmentOverdue(row, today),
    targetDurationSeconds: blocks.reduce((sum, block) => sum + (block.durationS ?? 0), 0) || null,
    targetDistanceMeters: blocks.reduce((sum, block) => sum + Number(block.distanceM ?? 0), 0) || null,
    execution: execution
      ? {
        startedAt: execution.startedAt,
        durationSeconds: execution.durationSeconds,
        distanceMeters: execution.distanceMeters,
        complianceScore: execution.compliance?.overallScore ?? null,
        rpe: execution.feedback?.rpe ?? null,
      }
      : null,
  };
}

export class GetCoachAthleteOverview {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string) {
    const context: CoachAthleteContext = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, schoolId, athleteId);

    const today = startOfUtcDay(this.clock());
    const weekStart = daysBefore(today, WEEK_DAYS - 1);
    const previousWeekStart = daysBefore(weekStart, WEEK_DAYS);

    const inScope = {
      schoolId: context.schoolId,
      athleteId,
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      createdAt: { gte: context.periodStart },
    } as const;

    const [counts, nextRows, recentRows, thisWeek, previousWeek, openChangeRequests, heldBack] = await Promise.all([
      Promise.all(ATHLETE_TRAINING_FILTERS.map((filter) =>
        this.db.workoutAssignment.count({
          where: { AND: [inScope, assignmentFilterWhere(filter, today)] },
        }),
      )),
      this.db.workoutAssignment.findMany({
        where: { AND: [inScope, assignmentFilterWhere("proximos", today)] },
        select: ROW_SELECT,
        orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { id: "desc" }],
        take: 1,
      }),
      this.db.workoutAssignment.findMany({
        where: { AND: [inScope, { scheduledAt: { not: null, lt: today } }] },
        select: ROW_SELECT,
        orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
        take: RECENT_LIMIT,
      }),
      this.weekVolume(athleteId, context, weekStart),
      this.weekVolume(athleteId, context, previousWeekStart, weekStart),
      this.db.workoutChangeRequest.count({
        where: {
          schoolId: context.schoolId,
          status: { in: OPEN_CHANGE_REQUEST_STATUSES },
          workoutAssignment: { athleteId, createdAt: { gte: context.periodStart } },
        },
      }),
      this.db.workoutAssignment.count({
        where: {
          schoolId: context.schoolId,
          athleteId,
          status: { not: WorkoutAssignmentStatus.UNPLANNED },
          createdAt: { lt: context.periodStart },
        },
      }),
    ]);

    return {
      context,
      counts: Object.fromEntries(
        ATHLETE_TRAINING_FILTERS.map((filter, index) => [filter, counts[index]!]),
      ) as Record<(typeof ATHLETE_TRAINING_FILTERS)[number], number>,
      nextWorkout: nextRows[0] ? toRow(nextRows[0] as Row, today) : null,
      recentWorkouts: (recentRows as Row[]).map((row) => toRow(row, today)),
      thisWeek,
      previousWeek,
      openChangeRequests,
      heldBack,
    };
  }

  /**
   * Volume of what was actually executed inside the window, read from matched
   * executions rather than from prescriptions: a prescribed workout the athlete
   * skipped is not volume, and counting it would inflate the comparison.
   */
  private async weekVolume(
    athleteId: string,
    context: CoachAthleteContext,
    from: Date,
    until?: Date,
  ): Promise<AthleteWeekVolume> {
    const result = await this.db.workoutExecution.aggregate({
      where: {
        athleteId,
        matchStatus: { in: MATCHED_EXECUTION_STATUSES },
        startedAt: { gte: from, ...(until ? { lt: until } : {}) },
        assignment: {
          schoolId: context.schoolId,
          createdAt: { gte: context.periodStart },
          status: { not: WorkoutAssignmentStatus.UNPLANNED },
        },
      },
      _count: { _all: true },
      _sum: { durationSeconds: true, distanceMeters: true },
    });
    return {
      sessions: result._count._all,
      durationSeconds: result._sum.durationSeconds ?? 0,
      distanceMeters: result._sum.distanceMeters ?? 0,
    };
  }
}
