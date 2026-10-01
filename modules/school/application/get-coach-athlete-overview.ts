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
import type { AnalysisSession } from "../domain/athlete-analysis";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { addCalendarDays, localMidnightToUtc, mondayOnOrBefore, todayLocalDate } from "../domain/local-date";
import {
  assignmentFilterWhere,
  isAssignmentOverdue,
  MATCHED_EXECUTION_STATUSES,
  OPEN_CHANGE_REQUEST_STATUSES,
  startOfUtcDay,
  ATHLETE_TRAINING_FILTERS,
} from "./athlete-training-scope";
import { loadAthleteSessions } from "./load-athlete-sessions";
import { ResolveCoachAthleteContext, type CoachAthleteContext } from "./resolve-coach-athlete-context";

const RECENT_LIMIT = 5;
/** One calendar week, compared against the week before it. */
const WEEK_DAYS = 7;
/** SAM-20 — alert thresholds. */
const BASELINE_WEEKS = 4;
const VOLUME_SPIKE_RATIO = 0.3;
const INACTIVE_DAYS = 14;
const CHANGED_LOOKBACK_DAYS = 14;

export type AthleteAlertKind = "workout-changed" | "change-request-pending" | "restriction" | "inactive" | "volume-spike";
export type AthleteAlert = { kind: AthleteAlertKind; message: string };

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
  /** SAM-20 — sessions with no prescription behind them (self-logged or imported). */
  unprescribedSessions: number;
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

    const now = this.clock();
    const today = startOfUtcDay(now);
    // SAM-20 — calendar weeks (Monday–Sunday) in the school's zone, not a
    // rolling seven days: "this week" is what the coach planned as a week.
    const todayLocal = todayLocalDate(now, context.timeZone);
    const weekStartLocal = mondayOnOrBefore(todayLocal);
    const weekStart = localMidnightToUtc(weekStartLocal, context.timeZone);
    const previousWeekStart = localMidnightToUtc(addCalendarDays(weekStartLocal, -WEEK_DAYS), context.timeZone);
    const baselineStart = localMidnightToUtc(addCalendarDays(weekStartLocal, -WEEK_DAYS * BASELINE_WEEKS), context.timeZone);

    const inScope = {
      schoolId: context.schoolId,
      athleteId,
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      createdAt: { gte: context.periodStart },
    } as const;

    const [counts, nextRows, recentRows, sessions, openChangeRequests, heldBack, sheet, recentlyChanged, lastSessionAt] = await Promise.all([
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
      // Everything the athlete did (matched, self-logged, imported) over the
      // baseline weeks plus the current one — the same reading as the analysis.
      loadAthleteSessions(this.db, {
        athleteId, schoolId: context.schoolId, periodStart: context.periodStart,
        from: baselineStart, until: localMidnightToUtc(addCalendarDays(weekStartLocal, WEEK_DAYS), context.timeZone),
      }),
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
      this.db.athleteTechnicalSheet.findUnique({
        where: { schoolId_athleteId: { schoolId: context.schoolId, athleteId } },
        select: { restrictions: true },
      }),
      // Prescriptions changed after being written, in the last two weeks.
      this.db.workoutAssignmentHistory.count({
        where: {
          eventType: { in: ["RESCHEDULED", "PLAN_ADAPTATION_ACCEPTED"] },
          createdAt: { gte: daysBefore(today, CHANGED_LOOKBACK_DAYS) },
          workoutAssignment: inScope,
        },
      }),
      this.lastSessionAt(athleteId, context),
    ]);

    const thisWeekSessions = sessions.filter((session) => session.startedAt >= weekStart);
    const previousWeekSessions = sessions.filter((session) => session.startedAt >= previousWeekStart && session.startedAt < weekStart);
    const baselineSessions = sessions.filter((session) => session.startedAt >= baselineStart && session.startedAt < weekStart);
    const thisWeek = volumeOf(thisWeekSessions);
    const previousWeek = volumeOf(previousWeekSessions);
    const baselineWeeklyDuration = baselineSessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0) / BASELINE_WEEKS;

    const daysSinceLastSession = lastSessionAt ? Math.floor((now.getTime() - lastSessionAt.getTime()) / 86_400_000) : null;

    // SAM-20 — alerts only from facts that exist; an empty list is the normal state.
    const alerts: AthleteAlert[] = [];
    if (recentlyChanged > 0) {
      alerts.push({ kind: "workout-changed", message: `${recentlyChanged} prescrição(ões) alterada(s) após a prescrição nos últimos ${CHANGED_LOOKBACK_DAYS} dias.` });
    }
    if (openChangeRequests > 0) {
      alerts.push({ kind: "change-request-pending", message: `${openChangeRequests} solicitação(ões) de alteração aguardando resposta.` });
    }
    if (sheet?.restrictions) {
      alerts.push({ kind: "restriction", message: "Há cuidados registrados na ficha técnica deste atleta." });
    }
    if (daysSinceLastSession === null || daysSinceLastSession >= INACTIVE_DAYS) {
      alerts.push({
        kind: "inactive",
        message: daysSinceLastSession === null
          ? "Nenhuma sessão registrada neste vínculo."
          : `${daysSinceLastSession} dias sem sessão registrada.`,
      });
    }
    if (baselineWeeklyDuration > 0 && thisWeek.durationSeconds > baselineWeeklyDuration * (1 + VOLUME_SPIKE_RATIO)) {
      alerts.push({
        kind: "volume-spike",
        message: `Semana atual ${Math.round(((thisWeek.durationSeconds - baselineWeeklyDuration) / baselineWeeklyDuration) * 100)}% acima da média das últimas ${BASELINE_WEEKS} semanas.`,
      });
    }

    return {
      context,
      counts: Object.fromEntries(
        ATHLETE_TRAINING_FILTERS.map((filter, index) => [filter, counts[index]!]),
      ) as Record<(typeof ATHLETE_TRAINING_FILTERS)[number], number>,
      nextWorkout: nextRows[0] ? toRow(nextRows[0] as Row, today) : null,
      recentWorkouts: (recentRows as Row[]).map((row) => toRow(row, today)),
      /** Calendar week (Monday → now) in the school's zone; prescribed and not. */
      thisWeek,
      /** The full previous calendar week. */
      previousWeek,
      weekStart: weekStartLocal,
      openChangeRequests,
      heldBack,
      alerts,
    };
  }

  /** Most recent session from any source, for the inactivity alert. */
  private async lastSessionAt(athleteId: string, context: CoachAthleteContext): Promise<Date | null> {
    const [execution, activity] = await Promise.all([
      this.db.workoutExecution.findFirst({
        where: {
          athleteId, matchStatus: { in: MATCHED_EXECUTION_STATUSES },
          assignment: { schoolId: context.schoolId, createdAt: { gte: context.periodStart } },
        },
        select: { startedAt: true },
        orderBy: { startedAt: "desc" },
      }),
      this.db.activity.findFirst({
        where: { userId: athleteId, startedAt: { gte: context.periodStart } },
        select: { startedAt: true },
        orderBy: { startedAt: "desc" },
      }),
    ]);
    const candidates = [execution?.startedAt, activity?.startedAt].filter((date): date is Date => Boolean(date));
    return candidates.length > 0 ? new Date(Math.max(...candidates.map((date) => date.getTime()))) : null;
  }
}

function volumeOf(sessions: readonly AnalysisSession[]): AthleteWeekVolume {
  return {
    sessions: sessions.length,
    durationSeconds: sessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0),
    distanceMeters: sessions.reduce((sum, session) => sum + (session.distanceMeters ?? 0), 0),
    unprescribedSessions: sessions.filter((session) => session.origin === "unprescribed").length,
  };
}
