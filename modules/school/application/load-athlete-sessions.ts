/**
 * SAM-20 — everything one athlete did inside a window, as `AnalysisSession`s:
 * executions matched to a prescription in this scope, sessions the athlete
 * logged without one (UNPLANNED assignment), and imported activities nobody
 * matched. Shared by the analysis and the overview so "volume" means the same
 * thing on both screens.
 *
 * An activity already behind an execution (by `activityId`, or by the legacy
 * `(provider, externalId)` pair) is dropped, so nothing is counted twice
 * (`splitLinkedActivities`, SAM-33).
 *
 * Nothing before `periodStart` is read (ADR-005) unless the caller passes
 * `historyAllowed`: the `activities` consent category resolved by
 * `CanReadAthleteHistory` (SAM-33). Rows before the period are then kept only
 * for the dates the athlete granted.
 */
import type { PrismaClient } from "@prisma/client";
import type { AnalysisSession } from "../domain/athlete-analysis";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";
import { splitLinkedActivities } from "./unplanned-activities";

type SessionsDb = Pick<PrismaClient, "workoutExecution" | "activity">;

export type SessionWindow = {
  athleteId: string;
  /** The school the prescriptions belong to, or null for independent coaching (SAM-30). */
  schoolId: string | null;
  /** Required when `schoolId` is null: `{ schoolId: null }` alone would also match marketplace and self-logged rows. */
  coachId?: string;
  periodStart: Date;
  from: Date;
  /** Exclusive. */
  until: Date;
  sportType?: string;
  /**
   * Consent for dates before `periodStart` (`HistoryAccessGrant.scope.activities`).
   * Absent means "nothing before the period", as before.
   */
  historyAllowed?: (occurredAt: Date) => boolean;
};

/** Garmin stores `hrTimeInZone_1..5` seconds in the activity summary; Strava stores nothing comparable. */
export function zoneSecondsFromMetrics(metrics: unknown): number[] | null {
  if (!metrics || typeof metrics !== "object") return null;
  const record = metrics as Record<string, unknown>;
  const zones = [1, 2, 3, 4, 5].map((zone) => {
    const value = record[`hrTimeInZone_${zone}`];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  return zones.some((seconds) => seconds > 0) ? zones : null;
}

export async function loadAthleteSessions(db: SessionsDb, window: SessionWindow): Promise<AnalysisSession[]> {
  if (window.schoolId === null && !window.coachId) {
    throw new Error("loadAthleteSessions: an independent window needs the coachId");
  }
  const consent = window.historyAllowed;
  const from = window.from < window.periodStart && !consent ? window.periodStart : window.from;
  const sportFilter = window.sportType ? { sportType: window.sportType } : {};
  const assignmentScope = window.schoolId === null
    ? { schoolId: null, coachId: window.coachId }
    : { schoolId: window.schoolId };

  const [executions, activities] = await Promise.all([
    db.workoutExecution.findMany({
      where: {
        athleteId: window.athleteId,
        matchStatus: { in: MATCHED_EXECUTION_STATUSES },
        startedAt: { gte: from, lt: window.until },
        assignment: {
          OR: [
            { ...assignmentScope, createdAt: { gte: window.periodStart } },
            // SAM-33 — sessions the athlete logged on their own belong to no
            // school and no coach; the responsible coach still sees them.
            { status: WorkoutAssignmentStatus.UNPLANNED, schoolId: null, coachId: null },
          ],
        },
        ...sportFilter,
      },
      select: {
        id: true, startedAt: true, durationSeconds: true, distanceMeters: true, sportType: true,
        averageHeartRate: true, averageSpeed: true, activityId: true, source: true, externalId: true,
        assignment: { select: { status: true } },
        activity: { select: { metrics: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    db.activity.findMany({
      where: { userId: window.athleteId, startedAt: { gte: from, lt: window.until }, ...sportFilter },
      select: {
        id: true, provider: true, externalId: true, startedAt: true, sportType: true,
        durationSeconds: true, movingSeconds: true, distanceMeters: true,
        averageHeartRate: true, averageSpeed: true, metrics: true,
      },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const readable = (startedAt: Date) => startedAt >= window.periodStart || (consent?.(startedAt) ?? false);
  const { unlinked } = splitLinkedActivities(executions, activities);

  return [
    ...executions
      .filter((execution) => readable(execution.startedAt))
      .map((execution): AnalysisSession => ({
        id: `execution:${execution.id}`,
        origin: execution.assignment.status === WorkoutAssignmentStatus.UNPLANNED ? "unprescribed" : "prescribed",
        startedAt: execution.startedAt,
        sportType: execution.sportType,
        durationSeconds: execution.durationSeconds,
        distanceMeters: execution.distanceMeters,
        averageHeartRate: execution.averageHeartRate,
        averageSpeed: execution.averageSpeed,
        zoneSeconds: zoneSecondsFromMetrics(execution.activity?.metrics),
      })),
    ...unlinked
      .filter((activity) => readable(activity.startedAt))
      .map((activity): AnalysisSession => ({
        id: `activity:${activity.id}`,
        origin: "unprescribed",
        startedAt: activity.startedAt,
        sportType: activity.sportType,
        durationSeconds: activity.movingSeconds ?? activity.durationSeconds,
        distanceMeters: activity.distanceMeters,
        averageHeartRate: activity.averageHeartRate,
        averageSpeed: activity.averageSpeed,
        zoneSeconds: zoneSecondsFromMetrics(activity.metrics),
      })),
  ];
}
