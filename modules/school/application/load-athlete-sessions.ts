/**
 * SAM-20 — everything one athlete did inside a window, as `AnalysisSession`s:
 * executions matched to a prescription in this school, sessions the athlete
 * logged without one (UNPLANNED assignment), and imported activities nobody
 * matched. Shared by the analysis and the overview so "volume" means the same
 * thing on both screens.
 *
 * An activity already behind an execution (by `activityId`, or by the legacy
 * `(provider, externalId)` pair) is dropped, so nothing is counted twice.
 * Nothing before `periodStart` is read (ADR-005).
 */
import type { PrismaClient } from "@prisma/client";
import type { AnalysisSession } from "../domain/athlete-analysis";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";

type SessionsDb = Pick<PrismaClient, "workoutExecution" | "activity">;

export type SessionWindow = {
  athleteId: string;
  schoolId: string;
  periodStart: Date;
  from: Date;
  /** Exclusive. */
  until: Date;
  sportType?: string;
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
  const from = window.from < window.periodStart ? window.periodStart : window.from;
  const sportFilter = window.sportType ? { sportType: window.sportType } : {};

  const [executions, activities] = await Promise.all([
    db.workoutExecution.findMany({
      where: {
        athleteId: window.athleteId,
        matchStatus: { in: MATCHED_EXECUTION_STATUSES },
        startedAt: { gte: from, lt: window.until },
        assignment: { schoolId: window.schoolId, createdAt: { gte: window.periodStart } },
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

  const linkedActivityIds = new Set(executions.map((execution) => execution.activityId).filter(Boolean));
  const linkedExternal = new Set(executions.map((execution) => `${execution.source.toUpperCase()}:${execution.externalId}`));

  return [
    ...executions.map((execution): AnalysisSession => ({
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
    ...activities
      .filter((activity) => !linkedActivityIds.has(activity.id)
        && !linkedExternal.has(`${activity.provider}:${activity.externalId}`))
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
