/**
 * SAM-44 — evolution per activity (not per week) and the expanded adherence.
 *
 * Pure: sessions and the extras the application layer loads (rich stats of
 * the import, the athlete's RPE, the prescribed × executed outcome) come in,
 * serialisable points for the charts come out. Absence stays absence: a metric
 * the provider did not send is `null`, never 0, and a chart series only exists
 * for metrics with data.
 */
import { METRIC_DISPLAY_RULES, getMetricDisplayCategory } from "@/modules/shared/activities/metric-display-categories";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";
import type { AnalysisSession } from "./athlete-analysis";
import { utcToLocalDateTime } from "./local-date";
import { derivePrescriptionOutcome, PrescriptionOutcome } from "./prescription-outcome";
import { heartRateLoad, type HeartRateLoadParameters } from "./training-load";
import { plannedTotalsOfRows, type PlannedBlockRow } from "./workout-structure";

export type PaceUnit = "per-km" | "per-100m";

export type ActivityPoint = {
  /** `activity:<id>` or `execution:<id>` (the session id). */
  id: string;
  /** The imported `Activity` behind the point, when there is one (link to its detail). */
  activityId: string | null;
  /** Local calendar date, for the x axis. */
  date: string;
  startedAt: string;
  sportType: string;
  origin: AnalysisSession["origin"];
  outcome: PrescriptionOutcome | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  /** Seconds per km or per 100 m, by the sport's display rule; null for sports without pace. */
  paceSeconds: number | null;
  paceUnit: PaceUnit | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  heartRateLoad: number | null;
  /** The athlete's RPE 1–10, when they rated it. */
  rpe: number | null;
  strokeRate: number | null;
  distancePerStroke: number | null;
  swolf: number | null;
};

/** What the application layer knows beyond the session row. */
export type SessionExtras = {
  activityId?: string | null;
  outcome?: PrescriptionOutcome | null;
  rpe?: number | null;
  maxHeartRate?: number | null;
  strokeRate?: number | null;
  distancePerStroke?: number | null;
  swolf?: number | null;
};

function paceOf(sportType: string, speed: number | null): { paceSeconds: number | null; paceUnit: PaceUnit | null } {
  const key = sportType.trim().toLowerCase();
  const rules = METRIC_DISPLAY_RULES[isRyvanoSportType(key) ? getMetricDisplayCategory(key) : "default"];
  if (!rules.pace) return { paceSeconds: null, paceUnit: null };
  const unit: PaceUnit = rules.pace === "pace-per-100m" ? "per-100m" : "per-km";
  if (speed === null || !Number.isFinite(speed) || speed <= 0) return { paceSeconds: null, paceUnit: unit };
  return { paceSeconds: (unit === "per-100m" ? 100 : 1000) / speed, paceUnit: unit };
}

export function buildActivityPoints(
  sessions: readonly AnalysisSession[],
  extras: ReadonlyMap<string, SessionExtras>,
  timeZone: string,
  loadParams: HeartRateLoadParameters,
): ActivityPoint[] {
  return [...sessions]
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())
    .map((session) => {
      const extra = extras.get(session.id) ?? {};
      const { paceSeconds, paceUnit } = paceOf(session.sportType, session.averageSpeed);
      return {
        id: session.id,
        activityId: extra.activityId ?? (session.id.startsWith("activity:") ? session.id.slice("activity:".length) : null),
        date: utcToLocalDateTime(session.startedAt, timeZone).date,
        startedAt: session.startedAt.toISOString(),
        sportType: session.sportType,
        origin: session.origin,
        outcome: extra.outcome ?? (session.origin === "unprescribed" ? PrescriptionOutcome.UNPLANNED_ACTIVITY : null),
        distanceMeters: session.distanceMeters,
        durationSeconds: session.durationSeconds,
        paceSeconds,
        paceUnit,
        averageHeartRate: session.averageHeartRate,
        maxHeartRate: extra.maxHeartRate ?? null,
        heartRateLoad: heartRateLoad(session, loadParams),
        rpe: extra.rpe ?? null,
        strokeRate: extra.strokeRate ?? null,
        distancePerStroke: extra.distancePerStroke ?? null,
        swolf: extra.swolf ?? null,
      };
    });
}

// ---------------------------------------------------------------------------
// Adherence: planned × executed
// ---------------------------------------------------------------------------

export type PlannedBlock = PlannedBlockRow;

/**
 * Planned duration of a prescription's blocks — SAM-48: the same
 * `plannedTotals` every screen and compliance use (repetitions and rest
 * between them), never a second formula. Null when no block has a duration.
 */
export function plannedDurationOfBlocks(blocks: readonly PlannedBlock[] | null | undefined): number | null {
  if (!blocks || blocks.length === 0) return null;
  return plannedTotalsOfRows(blocks).durationSeconds;
}

export type PrescriptionForAdherence = {
  status: string;
  workoutSportType: string | null;
  plannedDurationSeconds: number | null;
  matchedExecution: { sportType: string; durationSeconds: number | null } | null;
};

export type AdherenceDetail = {
  /** Prescriptions of the window by derived outcome (withdrawn ones are not counted). */
  byOutcome: Record<Exclude<PrescriptionOutcome, "UNPLANNED_ACTIVITY">, number>;
  /**
   * SAM-48 (AC12) — PLANNED_NOT_EXECUTED split by what is actually known:
   * the athlete justified it, reported it as missed without a reason, or
   * there is simply no record (late sync, forgot to log). Never one "falta".
   */
  notExecuted: { justified: number; missed: number; noRecord: number };
  counted: number;
  /** Σ planned duration of the counted prescriptions with blocks; null when none had a planned duration. */
  plannedDurationSeconds: number | null;
  /**
   * Σ executed duration of the matched executions that measured a duration;
   * null when none did. An execution without a duration is "não medida",
   * counted in `unmeasuredExecutions`, never summed as 0 (§18.3, AC11).
   */
  executedDurationSeconds: number | null;
  unmeasuredExecutions: number;
  /** Sessions per week: prescribed (counted / weeks) and executed (matched / weeks). */
  plannedPerWeek: number;
  executedPerWeek: number;
};

export function summarizeAdherence(prescriptions: readonly PrescriptionForAdherence[], weeks: number): AdherenceDetail {
  const byOutcome: AdherenceDetail["byOutcome"] = {
    PLANNED_NOT_EXECUTED: 0, EXECUTED_AS_PLANNED: 0, EXECUTED_PARTIALLY: 0, EXECUTED_DIFFERENTLY: 0,
  };
  const notExecuted = { justified: 0, missed: 0, noRecord: 0 };
  let counted = 0;
  let planned: number | null = null;
  let executed: number | null = null;
  let unmeasured = 0;
  let matched = 0;
  for (const prescription of prescriptions) {
    const outcome = derivePrescriptionOutcome({
      assignmentStatus: prescription.status,
      workoutSportType: prescription.workoutSportType,
      matchedExecution: prescription.matchedExecution,
    });
    if (outcome === null || outcome === PrescriptionOutcome.UNPLANNED_ACTIVITY) continue;
    byOutcome[outcome] += 1;
    counted += 1;
    if (outcome === PrescriptionOutcome.PLANNED_NOT_EXECUTED) {
      if (prescription.status === "JUSTIFIED") notExecuted.justified += 1;
      else if (prescription.status === "MISSED") notExecuted.missed += 1;
      else notExecuted.noRecord += 1;
    }
    if (prescription.plannedDurationSeconds !== null) planned = (planned ?? 0) + prescription.plannedDurationSeconds;
    if (prescription.matchedExecution) {
      matched += 1;
      const duration = prescription.matchedExecution.durationSeconds;
      if (duration === null) unmeasured += 1;
      else executed = (executed ?? 0) + duration;
    }
  }
  const safeWeeks = Math.max(1, weeks);
  return {
    byOutcome,
    notExecuted,
    counted,
    plannedDurationSeconds: planned,
    executedDurationSeconds: executed,
    unmeasuredExecutions: unmeasured,
    plannedPerWeek: Math.round((counted / safeWeeks) * 10) / 10,
    executedPerWeek: Math.round((matched / safeWeeks) * 10) / 10,
  };
}
