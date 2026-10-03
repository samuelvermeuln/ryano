/**
 * T192 — ComplianceStrategy interface
 * T197–T204 — Individual compliance score functions
 * T193 — DefaultComplianceStrategy
 * T194 — SwimComplianceStrategy
 * T195 — RunComplianceStrategy
 * T196 — BikeComplianceStrategy
 * SAM-19 — formula v2 (ADR-006): repetitions and rest in the planned totals,
 * intensity compared block by block against laps when they align with the
 * structure, else against the duration-weighted target of the main blocks
 * (warm-up / cool-down / recovery excluded), and `zones` as the share of
 * effort time spent inside the prescribed heart-rate range.
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
import {
  alignStructure,
  asStructuredBlocks,
  AUXILIARY_BLOCK_TYPES,
  numberField,
  plannedTotals,
  repetitionsOf,
  type PlannedTotals,
  type StructuredBlock,
  type StructureSegment,
} from "./workout-structure";

// ---------------------------------------------------------------------------
// T192 — Interface
// ---------------------------------------------------------------------------

export interface ComplianceResult {
  /** null = no dimension could be measured; no compliance record is kept. */
  overallScore: number | null;
  breakdown: ComplianceBreakdown;
  strategyKey: string;
}

/**
 * SAM-19 — one lap as the activity recorded it. Structurally the
 * provider-agnostic `ActivityLap` of the activity detail contract; declared
 * here so the domain does not depend on a presentation type.
 */
export interface ExecutionLap {
  index: number;
  durationSeconds: number | null;
  distanceMeters: number | null;
  /** Metres per second. */
  averageSpeed: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averagePower: number | null;
}

/** Optional detail beyond the execution's summary row. */
export interface ExecutionDetail {
  laps?: readonly ExecutionLap[];
}

export interface ComplianceStrategy {
  readonly key: string;
  calculate(snapshot: WorkoutSnapshot, execution: WorkoutExecution, detail?: ExecutionDetail): ComplianceResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Weighted mean that ignores null/absent dimensions. SAM-48 — when every
 * dimension is absent there is nothing to score: `null` ("sem dados"), never a
 * 0 that reads as "did nothing right" (§18.3, AC11).
 */
function weightedMean(pairs: Array<[score: number | null | undefined, weight: number]>): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [score, weight] of pairs) {
    if (score != null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }
  return totalWeight === 0 ? null : Math.round(weightedSum / totalWeight);
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

type Prescription = { blocks: StructuredBlock[]; totals: PlannedTotals };

function prescriptionOf(snapshot: WorkoutSnapshot): Prescription {
  const content = snapshot.content as Record<string, unknown> | null;
  const blocks = asStructuredBlocks(content?.blocks);
  return { blocks, totals: plannedTotals(blocks) };
}

/** The effort blocks: everything that is not warm-up, cool-down or recovery; all blocks when there is nothing else. */
function mainBlocks(blocks: readonly StructuredBlock[]): StructuredBlock[] {
  const main = blocks.filter((block) => !AUXILIARY_BLOCK_TYPES.has(block.blockType));
  return main.length > 0 ? main : [...blocks];
}

/** Weight of a block in an intensity average: its planned effort time, or 1 when no block has a duration. */
function blockWeight(block: StructuredBlock): number {
  return block.durationS != null && block.durationS > 0 ? repetitionsOf(block) * block.durationS : 0;
}

/**
 * Duration-weighted mean of a per-block target over the main blocks that
 * declare it. Blocks without a duration count equally when none has one.
 */
function weightedTarget(blocks: readonly StructuredBlock[], read: (payload: unknown) => number | null): number | null {
  const withTarget = mainBlocks(blocks)
    .map((block) => ({ target: read(block.targetPayload), weight: blockWeight(block) }))
    .filter((entry): entry is { target: number; weight: number } => entry.target !== null);
  if (withTarget.length === 0) return null;
  const anyWeight = withTarget.some((entry) => entry.weight > 0);
  let sum = 0;
  let total = 0;
  for (const entry of withTarget) {
    const weight = anyWeight ? entry.weight : 1;
    if (weight <= 0) continue;
    sum += entry.target * weight;
    total += weight;
  }
  return total > 0 ? sum / total : null;
}

function heartRateTargetOf(payload: unknown): number | null {
  const min = numberField(payload, "heartRateMin");
  const max = numberField(payload, "heartRateMax");
  if (min !== null && max !== null) return (min + max) / 2;
  if (min !== null) return min;
  if (max !== null) return max;
  return numberField(payload, "heartRate");
}

function heartRateRangeOf(payload: unknown): { min: number; max: number } | null {
  const min = numberField(payload, "heartRateMin");
  const max = numberField(payload, "heartRateMax");
  if (min === null && max === null) {
    const single = numberField(payload, "heartRate");
    return single === null ? null : { min: single * 0.95, max: single * 1.05 };
  }
  return { min: min ?? 0, max: max ?? Number.POSITIVE_INFINITY };
}

/** Target speed in m/s from a pace target (seconds per km or per 100 m). */
function speedTargetOf(payload: unknown): number | null {
  const perKm = numberField(payload, "paceSecPerKm");
  if (perKm !== null && perKm > 0) return 1000 / perKm;
  const per100 = numberField(payload, "paceSec100m");
  if (per100 !== null && per100 > 0) return 100 / per100;
  return null;
}

function lapSpeed(lap: ExecutionLap): number | null {
  if (lap.averageSpeed !== null && lap.averageSpeed > 0) return lap.averageSpeed;
  if (lap.distanceMeters && lap.durationSeconds && lap.durationSeconds > 0) return lap.distanceMeters / lap.durationSeconds;
  return null;
}

/** Work segments paired with their laps, when the activity's laps align with the structure. */
function alignedWork(prescription: Prescription, detail: ExecutionDetail | undefined): Array<{ segment: StructureSegment; lap: ExecutionLap }> | null {
  const laps = detail?.laps;
  if (!laps || laps.length === 0) return null;
  const segments = alignStructure(prescription.blocks, laps.length);
  if (!segments) return null;
  return segments
    .map((segment, position) => ({ segment, lap: laps[position] }))
    .filter((pair) => pair.segment.kind === "work");
}

/** Lap-duration-weighted deviation score over the aligned work segments that have a target and a reading. */
function perSegmentScore(
  pairs: Array<{ segment: StructureSegment; lap: ExecutionLap }>,
  target: (payload: unknown) => number | null,
  actual: (lap: ExecutionLap) => number | null,
): number | null {
  let sum = 0;
  let total = 0;
  for (const { segment, lap } of pairs) {
    const expected = target(segment.payload);
    const measured = actual(lap);
    if (expected === null || expected <= 0 || measured === null) continue;
    const weight = lap.durationSeconds ?? segment.durationS ?? 1;
    sum += deviationScore(expected, measured) * weight;
    total += weight;
  }
  return total > 0 ? Math.round(sum / total) : null;
}

// ---------------------------------------------------------------------------
// T197 — Distance compliance score
// ---------------------------------------------------------------------------

/** Compares actual distance to Σ reps × distance of the prescribed blocks. Null when either side is missing. */
export function complianceDistanceScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.distanceMeters) return null;
  const { totals } = prescriptionOf(snapshot);
  if (totals.distanceMeters === null || totals.distanceMeters <= 0) return null;
  return deviationScore(totals.distanceMeters, execution.distanceMeters);
}

// ---------------------------------------------------------------------------
// T198 — Duration compliance score
// ---------------------------------------------------------------------------

/**
 * Compares the activity's time to Σ reps × (duration + rest). Elapsed time is
 * the right side when the prescription includes rest (a watch keeps running
 * during recovery); moving time otherwise.
 */
export function complianceDurationScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  const { totals } = prescriptionOf(snapshot);
  if (totals.durationSeconds === null || totals.durationSeconds <= 0) return null;
  const actual = totals.restSeconds
    ? execution.durationSeconds ?? execution.movingSeconds
    : execution.movingSeconds ?? execution.durationSeconds;
  if (!actual) return null;
  return deviationScore(totals.durationSeconds, actual);
}

// ---------------------------------------------------------------------------
// T199 — Pace compliance score
// ---------------------------------------------------------------------------

/**
 * Speed against the prescription: per block against laps when they align;
 * else the main blocks' pace targets (duration-weighted) against the average
 * speed; else the planned distance over the planned effort time.
 */
export function compliancePaceScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution, detail?: ExecutionDetail): number | null {
  const prescription = prescriptionOf(snapshot);
  const aligned = alignedWork(prescription, detail);
  if (aligned) {
    const perLap = perSegmentScore(aligned, speedTargetOf, lapSpeed);
    if (perLap !== null) return perLap;
  }
  if (!execution.averageSpeed) return null;
  const target = weightedTarget(prescription.blocks, speedTargetOf);
  if (target !== null) return deviationScore(target, execution.averageSpeed);
  const { distanceMeters, mainDurationSeconds, durationSeconds } = prescription.totals;
  const effort = mainDurationSeconds ?? durationSeconds;
  if (!distanceMeters || !effort) return null;
  return deviationScore(distanceMeters / effort, execution.averageSpeed);
}

// ---------------------------------------------------------------------------
// T200 — Heart rate compliance score
// ---------------------------------------------------------------------------

/**
 * Heart rate against the prescription: per block against laps when they
 * align; else the main blocks' range midpoints (duration-weighted — a warm-up
 * in Z1 never sets the target of the intervals in Z4) against the average.
 */
export function complianceHeartRateScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution, detail?: ExecutionDetail): number | null {
  const prescription = prescriptionOf(snapshot);
  const aligned = alignedWork(prescription, detail);
  if (aligned) {
    const perLap = perSegmentScore(aligned, heartRateTargetOf, (lap) => lap.averageHeartRate);
    if (perLap !== null) return perLap;
  }
  if (!execution.averageHeartRate) return null;
  const target = weightedTarget(prescription.blocks, heartRateTargetOf);
  return target === null ? null : deviationScore(target, execution.averageHeartRate);
}

// ---------------------------------------------------------------------------
// T201 — Power compliance score
// ---------------------------------------------------------------------------

/** Power against the prescription, with the same per-block / weighted-target reading as heart rate. */
export function compliancePowerScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution, detail?: ExecutionDetail): number | null {
  const prescription = prescriptionOf(snapshot);
  const aligned = alignedWork(prescription, detail);
  if (aligned) {
    const perLap = perSegmentScore(aligned, (payload) => numberField(payload, "power"), (lap) => lap.averagePower);
    if (perLap !== null) return perLap;
  }
  if (!execution.averagePower) return null;
  const target = weightedTarget(prescription.blocks, (payload) => numberField(payload, "power"));
  return target === null ? null : deviationScore(target, execution.averagePower);
}

// ---------------------------------------------------------------------------
// T202 — Intervals compliance score
// ---------------------------------------------------------------------------

/**
 * Proxy: whether the athlete completed all prescribed interval blocks.
 * "Completion" is inferred from time — the activity's time against
 * Σ reps × duration of the interval blocks. Null if no interval blocks exist.
 */
export function complianceIntervalsScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  const actual = execution.movingSeconds ?? execution.durationSeconds;
  if (!actual) return null;
  const { blocks } = prescriptionOf(snapshot);
  const intervalBlocks = blocks.filter((b) => b.blockType === "INTERVAL" || b.blockType === "WORK");
  if (intervalBlocks.length === 0) return null;
  const prescribedIntervalDuration = intervalBlocks.reduce(
    (sum, b) => sum + repetitionsOf(b) * (b.durationS ?? 0), 0,
  );
  if (prescribedIntervalDuration <= 0) return null;
  // Time ratio, symmetric: far too long is as much a miss as far too short
  // (v1 treated any overshoot as full completion).
  const ratio = actual / prescribedIntervalDuration;
  if (ratio >= 0.95 && ratio <= 1.2) return 100;
  if (ratio >= 0.85 && ratio <= 1.4) return 80;
  if (ratio >= 0.70 && ratio <= 1.6) return 60;
  if (ratio >= 0.50 && ratio <= 2.0) return 30;
  return 0;
}

// ---------------------------------------------------------------------------
// T203 — Rest compliance score
// ---------------------------------------------------------------------------

/**
 * Proxy: moving time vs total time against the planned share of rest
 * (Σ reps × rest in the payloads, plus explicit REST/RECOVERY blocks). A
 * moving ratio above the expected one means recovery was cut short.
 */
export function complianceRestScore(snapshot: WorkoutSnapshot, execution: WorkoutExecution): number | null {
  if (!execution.movingSeconds || !execution.durationSeconds) return null;
  const { blocks, totals } = prescriptionOf(snapshot);
  const restBlockSeconds = blocks
    .filter((b) => b.blockType === "REST" || b.blockType === "RECOVERY")
    .reduce((sum, b) => sum + repetitionsOf(b) * (b.durationS ?? 0), 0);
  const prescribedRestSeconds = (totals.restSeconds ?? 0) + restBlockSeconds;
  if (prescribedRestSeconds <= 0) return null;
  const totalPrescribed = totals.durationSeconds ?? 0;
  if (totalPrescribed <= 0) return null;
  // Expected moving ratio = (total - rest) / total
  const expectedMovingRatio = (totalPrescribed - prescribedRestSeconds) / totalPrescribed;
  const actualMovingRatio = execution.movingSeconds / execution.durationSeconds;
  const deviation = Math.max(0, actualMovingRatio - expectedMovingRatio);
  if (deviation <= 0.05) return 100;
  if (deviation <= 0.10) return 80;
  if (deviation <= 0.20) return 60;
  if (deviation <= 0.30) return 30;
  return 0;
}

// ---------------------------------------------------------------------------
// T204 — Zone compliance score (SAM-19: implemented from laps)
// ---------------------------------------------------------------------------

/** A lap counts as "in range" when its average sits inside the band with a 3% tolerance on each edge. */
const ZONE_EDGE_TOLERANCE = 0.03;

/**
 * Share (0–100) of effort time spent inside the prescribed heart-rate range,
 * from the laps aligned with the structure. Provider time-in-zone buckets are
 * not used: their bands are the device's, not the prescription's. Null when
 * no segment has a range or the laps do not align.
 */
export function complianceZonesScore(snapshot: WorkoutSnapshot, _execution: WorkoutExecution, detail?: ExecutionDetail): number | null {
  const aligned = alignedWork(prescriptionOf(snapshot), detail);
  if (!aligned) return null;
  let inRange = 0;
  let total = 0;
  for (const { segment, lap } of aligned) {
    const range = heartRateRangeOf(segment.payload);
    if (!range || lap.averageHeartRate === null) continue;
    const weight = lap.durationSeconds ?? segment.durationS ?? 1;
    total += weight;
    const low = range.min * (1 - ZONE_EDGE_TOLERANCE);
    const high = range.max === Number.POSITIVE_INFINITY ? range.max : range.max * (1 + ZONE_EDGE_TOLERANCE);
    if (lap.averageHeartRate >= low && lap.averageHeartRate <= high) inRange += weight;
  }
  return total > 0 ? Math.round((inRange / total) * 100) : null;
}

// ---------------------------------------------------------------------------
// T193 — DefaultComplianceStrategy
// ---------------------------------------------------------------------------

function clean(breakdown: Record<string, number | null>): ComplianceBreakdown {
  return Object.fromEntries(
    Object.entries(breakdown).filter((entry): entry is [string, number] => entry[1] !== null),
  ) as ComplianceBreakdown;
}

/** Fallback strategy used for any sport without a specialised strategy. */
export const DefaultComplianceStrategy: ComplianceStrategy = {
  key: "default",
  calculate(snapshot, execution, detail) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const heartRate = complianceHeartRateScore(snapshot, execution, detail);
    const zones     = complianceZonesScore(snapshot, execution, detail);

    const overallScore = weightedMean([
      [duration,  0.45],
      [distance,  0.30],
      [heartRate, 0.15],
      [zones,     0.10],
    ]);

    return { overallScore, breakdown: clean({ duration, distance, heartRate, zones }), strategyKey: "default" };
  },
};

// ---------------------------------------------------------------------------
// T195 — RunComplianceStrategy
// ---------------------------------------------------------------------------

export const RunComplianceStrategy: ComplianceStrategy = {
  key: "run",
  calculate(snapshot, execution, detail) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const pace      = compliancePaceScore(snapshot, execution, detail);
    const heartRate = complianceHeartRateScore(snapshot, execution, detail);
    const intervals = complianceIntervalsScore(snapshot, execution);
    const rest      = complianceRestScore(snapshot, execution);
    const zones     = complianceZonesScore(snapshot, execution, detail);

    const overallScore = weightedMean([
      [distance,  0.25],
      [duration,  0.20],
      [pace,      0.20],
      [heartRate, 0.15],
      [intervals, 0.10],
      [rest,      0.05],
      [zones,     0.05],
    ]);

    return { overallScore, breakdown: clean({ distance, duration, pace, heartRate, intervals, rest, zones }), strategyKey: "run" };
  },
};

// ---------------------------------------------------------------------------
// T194 — SwimComplianceStrategy
// ---------------------------------------------------------------------------

export const SwimComplianceStrategy: ComplianceStrategy = {
  key: "swim",
  calculate(snapshot, execution, detail) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const pace      = compliancePaceScore(snapshot, execution, detail);
    const intervals = complianceIntervalsScore(snapshot, execution);
    const rest      = complianceRestScore(snapshot, execution);

    const overallScore = weightedMean([
      [distance,  0.30],
      [pace,      0.30],
      [duration,  0.20],
      [intervals, 0.15],
      [rest,      0.05],
    ]);

    return { overallScore, breakdown: clean({ distance, duration, pace, intervals, rest }), strategyKey: "swim" };
  },
};

// ---------------------------------------------------------------------------
// T196 — BikeComplianceStrategy
// ---------------------------------------------------------------------------

export const BikeComplianceStrategy: ComplianceStrategy = {
  key: "bike",
  calculate(snapshot, execution, detail) {
    const distance  = complianceDistanceScore(snapshot, execution);
    const duration  = complianceDurationScore(snapshot, execution);
    const power     = compliancePowerScore(snapshot, execution, detail);
    const heartRate = complianceHeartRateScore(snapshot, execution, detail);
    const intervals = complianceIntervalsScore(snapshot, execution);
    const zones     = complianceZonesScore(snapshot, execution, detail);

    const overallScore = weightedMean([
      [power,     0.30],
      [distance,  0.20],
      [duration,  0.20],
      [heartRate, 0.15],
      [intervals, 0.10],
      [zones,     0.05],
    ]);

    return { overallScore, breakdown: clean({ distance, duration, power, heartRate, intervals, zones }), strategyKey: "bike" };
  },
};
