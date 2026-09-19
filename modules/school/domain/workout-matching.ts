/**
 * T164-T172 — WorkoutMatchingService
 *
 * Scores a candidate NormalizedActivity against a WorkoutAssignment prescription.
 * The service is composed of pure, independently-testable dimension functions,
 * each returning a sub-score in [0, 100]. The composite score is the weighted
 * sum of all active dimensions.
 *
 * Threshold rules (T172):
 *   ≥ STRONG_MATCH_THRESHOLD  → AUTO_MATCHED
 *   ≥ WEAK_MATCH_THRESHOLD    → candidate surfaced for user confirmation
 *   <  WEAK_MATCH_THRESHOLD   → NO_MATCH
 */

import type { ActivitySummary } from "./training-activity-reader";
import type { Workout } from "./workout";

// ---------------------------------------------------------------------------
// Thresholds (T172)
// ---------------------------------------------------------------------------

export const STRONG_MATCH_THRESHOLD = 80;
export const WEAK_MATCH_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single dimension's contribution to the composite score. */
export interface DimensionScore {
  dimension: string;
  /** Raw sub-score 0–100 for this dimension. */
  score: number;
  /** Weight applied when computing the composite. */
  weight: number;
}

export interface MatchScoreResult {
  /** Final composite score 0–100 (integer). */
  composite: number;
  /** Per-dimension breakdown for debugging and audit. */
  dimensions: DimensionScore[];
}

// ---------------------------------------------------------------------------
// T165 — Sport matching
// ---------------------------------------------------------------------------

/**
 * Returns 100 when sport types match exactly, 0 otherwise.
 * Both values are canonical RyvanoSportType strings.
 */
export function scoreSport(prescribedSport: string, actualSport: string): number {
  return prescribedSport === actualSport ? 100 : 0;
}

// ---------------------------------------------------------------------------
// T166 — Date matching
// ---------------------------------------------------------------------------

/**
 * Returns 100 when the activity started on the same calendar date as the
 * scheduled date (UTC), decaying linearly over a 3-day window.
 * A workout with no scheduled date scores 50 (neutral).
 */
export function scoreDate(scheduledDate: Date | null, activityStartedAt: Date): number {
  if (!scheduledDate) return 50;
  const prescribedDay = toUTCDay(scheduledDate);
  const activityDay = toUTCDay(activityStartedAt);
  const diff = Math.abs(prescribedDay - activityDay);
  if (diff === 0) return 100;
  if (diff === 1) return 70;
  if (diff === 2) return 40;
  if (diff === 3) return 10;
  return 0;
}

function toUTCDay(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

// ---------------------------------------------------------------------------
// T167 — Time-of-day proximity matching
// ---------------------------------------------------------------------------

/**
 * Returns 100 when the activity start time is within 30 minutes of the
 * prescribed start time, decaying to 0 at 3 hours difference.
 * When no scheduled start time is set, returns 50 (neutral).
 */
export function scoreTimeProximity(scheduledStartAt: Date | null, activityStartedAt: Date): number {
  if (!scheduledStartAt) return 50;
  const diffMinutes = Math.abs(scheduledStartAt.getTime() - activityStartedAt.getTime()) / 60_000;
  if (diffMinutes <= 30) return 100;
  if (diffMinutes <= 60) return 80;
  if (diffMinutes <= 120) return 50;
  if (diffMinutes <= 180) return 20;
  return 0;
}

// ---------------------------------------------------------------------------
// T168 — Duration matching
// ---------------------------------------------------------------------------

/**
 * Compares activity duration against the sum of block durations in the
 * workout snapshot. Returns 100 for ≤ 10% deviation, decaying to 0 at 50%.
 * Returns 50 when prescribed or actual duration is unavailable.
 */
export function scoreDuration(prescribedSeconds: number | null, actualSeconds: number | undefined | null): number {
  if (!prescribedSeconds || !actualSeconds) return 50;
  const ratio = actualSeconds / prescribedSeconds;
  const deviation = Math.abs(1 - ratio);
  if (deviation <= 0.1) return 100;
  if (deviation <= 0.2) return 80;
  if (deviation <= 0.3) return 60;
  if (deviation <= 0.4) return 30;
  if (deviation <= 0.5) return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// T169 — Distance matching
// ---------------------------------------------------------------------------

/**
 * Same deviation table as duration, applied to distance (meters).
 * Returns 50 when either value is missing.
 */
export function scoreDistance(prescribedMeters: number | null, actualMeters: number | undefined | null): number {
  if (!prescribedMeters || !actualMeters) return 50;
  const ratio = actualMeters / prescribedMeters;
  const deviation = Math.abs(1 - ratio);
  if (deviation <= 0.1) return 100;
  if (deviation <= 0.2) return 80;
  if (deviation <= 0.3) return 60;
  if (deviation <= 0.4) return 30;
  if (deviation <= 0.5) return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// T170 — Structural matching (block count proxy)
// ---------------------------------------------------------------------------

/**
 * Compares the number of workout blocks in the snapshot against a rough
 * proxy derived from the activity (e.g. segment count if available).
 * When structural data is absent, returns 50 (neutral).
 * Currently a lightweight proxy; will be refined when segment data is available.
 */
export function scoreStructural(blockCount: number, activitySegmentCount: number | null | undefined): number {
  if (!activitySegmentCount) return 50;
  const ratio = activitySegmentCount / blockCount;
  const deviation = Math.abs(1 - ratio);
  if (deviation <= 0.15) return 100;
  if (deviation <= 0.3) return 70;
  if (deviation <= 0.5) return 40;
  return 10;
}

// ---------------------------------------------------------------------------
// T171 — Composite score calculator
// ---------------------------------------------------------------------------

/** Weights must sum to 1.0. */
const DIMENSION_WEIGHTS = {
  sport: 0.35,
  date: 0.25,
  time: 0.10,
  duration: 0.15,
  distance: 0.10,
  structural: 0.05,
} as const;

export interface WorkoutMatchInput {
  workout: Pick<Workout, "sportType" | "scheduledDate" | "scheduledStartAt">;
  /** Sum of block target durations in the snapshot (seconds), if available. */
  prescribedDurationSeconds: number | null;
  /** Sum of block target distances in the snapshot (meters), if available. */
  prescribedDistanceMeters: number | null;
  /** Number of blocks in the snapshot. */
  blockCount: number;
  activity: ActivitySummary;
}

/**
 * Computes a composite match score in [0, 100] from all active dimensions.
 * Sport mismatch hard-blocks: if the sport sub-score is 0, the composite
 * is also 0 regardless of other dimensions (a swim cannot match a run).
 */
export function computeMatchScore(input: WorkoutMatchInput): MatchScoreResult {
  const sportScore = scoreSport(input.workout.sportType, input.activity.sportType);

  // Hard block on sport mismatch — don't waste effort computing other dimensions.
  if (sportScore === 0) {
    return {
      composite: 0,
      dimensions: [{ dimension: "sport", score: 0, weight: DIMENSION_WEIGHTS.sport }],
    };
  }

  const dimensions: DimensionScore[] = [
    { dimension: "sport",      score: sportScore,                                                                          weight: DIMENSION_WEIGHTS.sport },
    { dimension: "date",       score: scoreDate(input.workout.scheduledDate, input.activity.startedAt),                    weight: DIMENSION_WEIGHTS.date },
    { dimension: "time",       score: scoreTimeProximity(input.workout.scheduledStartAt, input.activity.startedAt),        weight: DIMENSION_WEIGHTS.time },
    { dimension: "duration",   score: scoreDuration(input.prescribedDurationSeconds, input.activity.durationSeconds),      weight: DIMENSION_WEIGHTS.duration },
    { dimension: "distance",   score: scoreDistance(input.prescribedDistanceMeters, input.activity.distanceMeters),        weight: DIMENSION_WEIGHTS.distance },
    { dimension: "structural", score: scoreStructural(input.blockCount, null),                                             weight: DIMENSION_WEIGHTS.structural },
  ];

  const composite = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  return { composite, dimensions };
}
