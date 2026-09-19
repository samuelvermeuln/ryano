/**
 * T192 — ComplianceStrategy interface
 * T197–T204 — Individual compliance score functions
 * T193 — DefaultComplianceStrategy
 * T194 — SwimComplianceStrategy
 * T195 — RunComplianceStrategy
 * T196 — BikeComplianceStrategy
 *
 * Design:
 *  - Each score function is a pure function returning 0–100 or null when the
 *    required data is absent. null means "not applicable / no data".
 *  - Each strategy selects which dimensions to evaluate and assigns weights.
 *  - The overall score is the weighted mean of available dimensions; absent
 *    dimensions are excluded from the denominator (not counted as 0).
 */

import type { WorkoutSnapshot } from "./workout";
import type { WorkoutExecution } from "./workout-execution";
import type { ComplianceBreakdown } from "./workout-compliance";

// ---------------------------------------------------------------------------
// T192 — Interface
// ---------------------------------------------------------------------------

export interface ComplianceResult {
  overallScore: number;
  breakdown: ComplianceBreakdown;
  strategyKey: string;
}

export interface ComplianceStrategy {
  readonly key: string;
  calculate(snapshot: WorkoutSnapshot, execution: WorkoutExecution): ComplianceResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Weighted mean that ignores null/absent dimensions. Returns 0 when all are absent. */
function weightedMean(pairs: Array<[score: number | null | undefined, weight: number]>): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [score, weight] of pairs) {
    if (score != null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }
  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}

/** Deviation table: returns 0–100 based on how close actual is to target. */
function deviationScore(target: number, actual: number): number {
  const deviation = Math.abs(actual - target) / target;
  if (deviation <= 0.05) return 100;
  if (deviation <= 0.10) return 90;
  if (deviation <= 0.15) return 80;
  if (deviation <= 0.20) return 70;
  if (deviation <= 0.30) return 50;
  if (deviation <= 0.40) return 30;
  if (deviation <= 0.50) return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// T197 — Distance compliance score
// ---------------------------------------------------------------------------

/**
 * Compares actual distance to the sum of `distanceM` in the snapshot blocks.
 * Returns null when either value is missing.
 */
export function complianceDistanceScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.distanceMeters) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  const prescribed = blocks.reduce((sum, b) => sum + (typeof b.distanceM === "number" ? b.distanceM : 0), 0);
  if (prescribed <= 0) return null;
  return deviationScore(prescribed, execution.distanceMeters);
}

// ---------------------------------------------------------------------------
// T198 — Duration compliance score
// ---------------------------------------------------------------------------

/**
 * Compares actual moving/duration time to the sum of `durationS` in snapshot blocks.
 */
export function complianceDurationScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  const actual = execution.movingSeconds ?? execution.durationSeconds;
  if (!actual) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  const prescribed = blocks.reduce((sum, b) => sum + (typeof b.durationS === "number" ? b.durationS : 0), 0);
  if (prescribed <= 0) return null;
  return deviationScore(prescribed, actual);
}

// ---------------------------------------------------------------------------
// T199 — Pace compliance score
// ---------------------------------------------------------------------------

/**
 * Compares actual average speed to a target speed derived from the snapshot.
 * Target speed is computed from total distance / total duration.
 * Returns null when either piece is missing.
 */
export function compliancePaceScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.averageSpeed) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  const totalDistance = blocks.reduce((sum, b) => sum + (typeof b.distanceM === "number" ? b.distanceM : 0), 0);
  const totalDuration = blocks.reduce((sum, b) => sum + (typeof b.durationS === "number" ? b.durationS : 0), 0);
  if (totalDistance <= 0 || totalDuration <= 0) return null;
  const targetSpeed = totalDistance / totalDuration; // m/s
  return deviationScore(targetSpeed, execution.averageSpeed);
}

// ---------------------------------------------------------------------------
// T200 — Heart rate compliance score
// ---------------------------------------------------------------------------

/**
 * Compares actual average HR to the target HR zone midpoint specified in the
 * snapshot's target payload. Falls back to a simple "within zone" check:
 * if targetHrMin/targetHrMax are present in the first block's targetPayload,
 * checks whether actual HR falls within the zone (±10%).
 */
export function complianceHeartRateScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.averageHeartRate) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  // Find first block with HR target
  for (const block of blocks) {
    const target = block.targetPayload as Record<string, unknown> | null;
    if (!target) continue;
    const hrMin = typeof target.heartRateMin === "number" ? target.heartRateMin : null;
    const hrMax = typeof target.heartRateMax === "number" ? target.heartRateMax : null;
    if (hrMin != null && hrMax != null) {
      const midpoint = (hrMin + hrMax) / 2;
      return deviationScore(midpoint, execution.averageHeartRate);
    }
    const hrTarget = typeof target.heartRate === "number" ? target.heartRate : null;
    if (hrTarget) return deviationScore(hrTarget, execution.averageHeartRate);
  }
  return null;
}

// ---------------------------------------------------------------------------
// T201 — Power compliance score
// ---------------------------------------------------------------------------

/**
 * Compares actual average power to the target power in the snapshot.
 */
export function compliancePowerScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.averagePower) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  for (const block of blocks) {
    const target = block.targetPayload as Record<string, unknown> | null;
    const watts = target && typeof target.power === "number" ? target.power : null;
    if (watts) return deviationScore(watts, execution.averagePower);
  }
  return null;
}

// ---------------------------------------------------------------------------
// T202 — Intervals compliance score
// ---------------------------------------------------------------------------

/**
 * Proxy: measures whether the athlete completed all prescribed interval blocks.
 * "Completion" is inferred from duration — if actual duration is at least 80%
 * of the sum of all interval block durations the athlete is considered to have
 * completed the intervals. Returns null if no interval blocks exist.
 */
export function complianceIntervalsScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  const actual = execution.movingSeconds ?? execution.durationSeconds;
  if (!actual) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  const intervalBlocks = blocks.filter((b) => b.blockType === "INTERVAL" || b.blockType === "WORK");
  if (intervalBlocks.length === 0) return null;
  const prescribedIntervalDuration = intervalBlocks.reduce(
    (sum, b) => sum + (typeof b.durationS === "number" ? b.durationS : 0), 0,
  );
  if (prescribedIntervalDuration <= 0) return null;
  // Score is based on time ratio — generous since we don't have lap data
  const ratio = Math.min(actual / prescribedIntervalDuration, 1.5);
  if (ratio >= 0.95) return 100;
  if (ratio >= 0.85) return 80;
  if (ratio >= 0.70) return 60;
  if (ratio >= 0.50) return 30;
  return 0;
}

// ---------------------------------------------------------------------------
// T203 — Rest compliance score
// ---------------------------------------------------------------------------

/**
 * Proxy: compares moving time vs total time to infer whether rest periods
 * were respected. A high movingSeconds/durationSeconds ratio on a workout with
 * rest blocks may indicate the athlete skipped recovery. Returns null if no
 * rest data is available.
 */
export function complianceRestScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.movingSeconds || !execution.durationSeconds) return null;
  const content = snapshot.content as Record<string, unknown>;
  const blocks = Array.isArray(content?.blocks) ? (content.blocks as Array<Record<string, unknown>>) : [];
  const restBlocks = blocks.filter((b) => b.blockType === "REST" || b.blockType === "RECOVERY");
  if (restBlocks.length === 0) return null;
  const prescribedRestSeconds = restBlocks.reduce(
    (sum, b) => sum + (typeof b.durationS === "number" ? b.durationS : 0), 0,
  );
  if (prescribedRestSeconds <= 0) return null;
  const totalPrescribed = blocks.reduce((sum, b) => sum + (typeof b.durationS === "number" ? b.durationS : 0), 0);
  if (totalPrescribed <= 0) return null;
  // Expected moving ratio = (total - rest) / total
  const expectedMovingRatio = (totalPrescribed - prescribedRestSeconds) / totalPrescribed;
  const actualMovingRatio = execution.movingSeconds / execution.durationSeconds;
  // If athlete moved more than expected, rest was cut short
  const deviation = Math.max(0, actualMovingRatio - expectedMovingRatio);
  if (deviation <= 0.05) return 100;
  if (deviation <= 0.10) return 80;
  if (deviation <= 0.20) return 60;
  if (deviation <= 0.30) return 30;
  return 0;
}

// ---------------------------------------------------------------------------
// T204 — Zone compliance score
// ---------------------------------------------------------------------------

/**
 * Checks whether the athlete trained in the prescribed HR zones.
 * Currently a stub that returns null until zone distribution data is available
 * in the activity payload — preserves the interface for future implementation.
 */
export function complianceZonesScore(_snapshot: WorkoutSnapshot, _execution: WorkoutExecution): number | null {
  return null; // Zone data not yet available in activity payload
}

// ---------------------------------------------------------------------------
// T193 — DefaultComplianceStrategy
// ---------------------------------------------------------------------------

/** Fallback strategy used for any sport without a specialised strategy. */
export const DefaultComplianceStrategy: ComplianceStrategy = {
  key: "default",
  calculate(snapshot, execution) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const heartRate = complianceHeartRateScore(snapshot, execution);

    const overallScore = weightedMean([
      [duration,  0.50],
      [distance,  0.35],
      [heartRate, 0.15],
    ]);

    return {
      overallScore,
      breakdown: { duration: duration ?? undefined, distance: distance ?? undefined, heartRate: heartRate ?? undefined },
      strategyKey: "default",
    };
  },
};

// ---------------------------------------------------------------------------
// T195 — RunComplianceStrategy
// ---------------------------------------------------------------------------

export const RunComplianceStrategy: ComplianceStrategy = {
  key: "run",
  calculate(snapshot, execution) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const pace      = compliancePaceScore(snapshot, execution);
    const heartRate = complianceHeartRateScore(snapshot, execution);
    const intervals = complianceIntervalsScore(snapshot, execution);
    const rest      = complianceRestScore(snapshot, execution);

    const overallScore = weightedMean([
      [distance,  0.25],
      [duration,  0.25],
      [pace,      0.20],
      [heartRate, 0.15],
      [intervals, 0.10],
      [rest,      0.05],
    ]);

    return {
      overallScore,
      breakdown: {
        distance:  distance  ?? undefined,
        duration:  duration  ?? undefined,
        pace:      pace      ?? undefined,
        heartRate: heartRate ?? undefined,
        intervals: intervals ?? undefined,
        rest:      rest      ?? undefined,
      },
      strategyKey: "run",
    };
  },
};

// ---------------------------------------------------------------------------
// T194 — SwimComplianceStrategy
// ---------------------------------------------------------------------------

export const SwimComplianceStrategy: ComplianceStrategy = {
  key: "swim",
  calculate(snapshot, execution) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const pace      = compliancePaceScore(snapshot, execution);
    const intervals = complianceIntervalsScore(snapshot, execution);
    const rest      = complianceRestScore(snapshot, execution);

    const overallScore = weightedMean([
      [distance,  0.30],
      [pace,      0.30],
      [duration,  0.20],
      [intervals, 0.15],
      [rest,      0.05],
    ]);

    return {
      overallScore,
      breakdown: {
        distance:  distance  ?? undefined,
        duration:  duration  ?? undefined,
        pace:      pace      ?? undefined,
        intervals: intervals ?? undefined,
        rest:      rest      ?? undefined,
      },
      strategyKey: "swim",
    };
  },
};

// ---------------------------------------------------------------------------
// T196 — BikeComplianceStrategy
// ---------------------------------------------------------------------------

export const BikeComplianceStrategy: ComplianceStrategy = {
  key: "bike",
  calculate(snapshot, execution) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const power     = compliancePowerScore(snapshot, execution);
    const heartRate = complianceHeartRateScore(snapshot, execution);
    const intervals = complianceIntervalsScore(snapshot, execution);

    const overallScore = weightedMean([
      [power,     0.30],
      [distance,  0.25],
      [duration,  0.20],
      [heartRate, 0.15],
      [intervals, 0.10],
    ]);

    return {
      overallScore,
      breakdown: {
        distance:  distance  ?? undefined,
        duration:  duration  ?? undefined,
        power:     power     ?? undefined,
        heartRate: heartRate ?? undefined,
        intervals: intervals ?? undefined,
      },
      strategyKey: "bike",
    };
  },
};
