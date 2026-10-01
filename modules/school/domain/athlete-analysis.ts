/**
 * SAM-20 — weekly aggregation of everything an athlete did, in the school's
 * calendar, with "prescribed" and "unprescribed" kept apart.
 *
 * Pure: the sessions come in already read (matched executions, self-logged
 * sessions and imported activities nobody matched), the week boundaries are
 * local calendar dates in the school's zone, and the output is what the
 * screen draws — stacked volume, heart-rate and pace trends, time in zone,
 * and heart-rate load when the sheet allows it (ADR-007).
 */
import {
  addCalendarDays,
  mondayOnOrBefore,
  utcToLocalDateTime,
  type LocalDate,
} from "./local-date";
import { canEstimateHeartRateLoad, heartRateLoad, type HeartRateLoadParameters } from "./training-load";

export type SessionOrigin = "prescribed" | "unprescribed";

/** One thing the athlete did, whatever table it came from. */
export type AnalysisSession = {
  id: string;
  origin: SessionOrigin;
  startedAt: Date;
  sportType: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate: number | null;
  averageSpeed: number | null;
  /** Seconds per zone index 0–4, when the provider stored them; else null. */
  zoneSeconds: number[] | null;
};

export type VolumeSlice = { sessions: number; durationSeconds: number; distanceMeters: number };

export type AnalysisWeek = {
  /** Monday, local calendar date in the school's zone. */
  weekStart: LocalDate;
  prescribed: VolumeSlice;
  unprescribed: VolumeSlice;
  total: VolumeSlice;
  /** Duration-weighted mean of the sessions that carried heart rate; null without any. */
  averageHeartRate: number | null;
  /** Σ seconds per zone (index 0–4) over the week's sessions; null when none had zones. */
  zoneSeconds: number[] | null;
  /** Σ hrTSS over the week's sessions; null when the sheet cannot estimate it. */
  heartRateLoad: number | null;
};

export type SportTrend = {
  sportType: string;
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
  /** Distance-weighted mean speed, m/s; null without distance and time. */
  averageSpeed: number | null;
  /** Duration-weighted mean heart rate; null without heart rate. */
  averageHeartRate: number | null;
};

export type WindowSummary = VolumeSlice & {
  averageHeartRate: number | null;
  heartRateLoad: number | null;
};

const emptySlice = (): VolumeSlice => ({ sessions: 0, durationSeconds: 0, distanceMeters: 0 });

function add(slice: VolumeSlice, session: AnalysisSession) {
  slice.sessions += 1;
  slice.durationSeconds += session.durationSeconds ?? 0;
  slice.distanceMeters += session.distanceMeters ?? 0;
}

/** Duration-weighted mean heart rate over the sessions that have both. */
export function weightedHeartRate(sessions: readonly AnalysisSession[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const session of sessions) {
    if (session.averageHeartRate === null || !session.durationSeconds) continue;
    sum += session.averageHeartRate * session.durationSeconds;
    weight += session.durationSeconds;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

function sumZoneSeconds(sessions: readonly AnalysisSession[]): number[] | null {
  let any = false;
  const totals = [0, 0, 0, 0, 0];
  for (const session of sessions) {
    if (!session.zoneSeconds) continue;
    any = true;
    session.zoneSeconds.forEach((seconds, index) => { totals[index] = (totals[index] ?? 0) + seconds; });
  }
  return any ? totals : null;
}

function sumLoad(sessions: readonly AnalysisSession[], params: HeartRateLoadParameters): number | null {
  if (!canEstimateHeartRateLoad(params)) return null;
  return sessions.reduce((total, session) => total + (heartRateLoad(session, params) ?? 0), 0);
}

/** Monday of the local week a session belongs to, in the school's zone. */
export function sessionWeekStart(startedAt: Date, timeZone: string): LocalDate {
  return mondayOnOrBefore(utcToLocalDateTime(startedAt, timeZone).date);
}

export function summarizeWindow(sessions: readonly AnalysisSession[], params: HeartRateLoadParameters): WindowSummary {
  const slice = emptySlice();
  for (const session of sessions) add(slice, session);
  return { ...slice, averageHeartRate: weightedHeartRate(sessions), heartRateLoad: sumLoad(sessions, params) };
}

/**
 * One row per local week from `weekStart` (a Monday) to `weekEnd` (exclusive),
 * every week present even when empty, so a gap in the series reads as "nothing
 * here" rather than as a missing column.
 */
export function aggregateWeeks(
  sessions: readonly AnalysisSession[],
  weekStart: LocalDate,
  weekEnd: LocalDate,
  timeZone: string,
  params: HeartRateLoadParameters,
): AnalysisWeek[] {
  const byWeek = new Map<LocalDate, AnalysisSession[]>();
  for (let cursor = weekStart; cursor < weekEnd; cursor = addCalendarDays(cursor, 7)) byWeek.set(cursor, []);
  for (const session of sessions) {
    const bucket = byWeek.get(sessionWeekStart(session.startedAt, timeZone));
    if (bucket) bucket.push(session);
  }
  return [...byWeek.entries()].map(([start, weekSessions]) => {
    const prescribed = emptySlice();
    const unprescribed = emptySlice();
    const total = emptySlice();
    for (const session of weekSessions) {
      add(session.origin === "prescribed" ? prescribed : unprescribed, session);
      add(total, session);
    }
    return {
      weekStart: start,
      prescribed,
      unprescribed,
      total,
      averageHeartRate: weightedHeartRate(weekSessions),
      zoneSeconds: sumZoneSeconds(weekSessions),
      heartRateLoad: sumLoad(weekSessions, params),
    };
  });
}

/** Per-modality totals and trends, heaviest first. */
export function aggregateBySport(sessions: readonly AnalysisSession[]): SportTrend[] {
  const groups = new Map<string, AnalysisSession[]>();
  for (const session of sessions) {
    const group = groups.get(session.sportType) ?? [];
    group.push(session);
    groups.set(session.sportType, group);
  }
  return [...groups.entries()]
    .map(([sportType, group]) => {
      const slice = emptySlice();
      for (const session of group) add(slice, session);
      // Speed as total distance over total time of the sessions that have both,
      // which is the distance-weighted mean the athlete actually ran.
      let metres = 0;
      let seconds = 0;
      for (const session of group) {
        if (session.distanceMeters && session.durationSeconds) {
          metres += session.distanceMeters;
          seconds += session.durationSeconds;
        }
      }
      return {
        sportType,
        ...slice,
        averageSpeed: metres > 0 && seconds > 0 ? metres / seconds : null,
        averageHeartRate: weightedHeartRate(group),
      };
    })
    .sort((a, b) => b.durationSeconds - a.durationSeconds);
}
