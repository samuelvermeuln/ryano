/**
 * T211 — Compliance tests per sport modality
 * T212 — Algorithm version test
 * T213 — Compliance fixture dataset
 *
 * Tests the compliance score functions, sport strategies,
 * WorkoutComplianceService strategy resolution, and COMPLIANCE_ALGORITHM_VERSION.
 */
import { describe, expect, it } from "vitest";
import {
  complianceDistanceScore,
  complianceDurationScore,
  compliancePaceScore,
  complianceHeartRateScore,
  compliancePowerScore,
  complianceIntervalsScore,
  complianceRestScore,
  complianceZonesScore,
  DefaultComplianceStrategy,
  RunComplianceStrategy,
  SwimComplianceStrategy,
  BikeComplianceStrategy,
} from "@/modules/school/domain/compliance-strategy";
import { resolveComplianceStrategy, calculateCompliance } from "@/modules/school/domain/workout-compliance-service";
import { COMPLIANCE_ALGORITHM_VERSION } from "@/modules/school/domain/workout-compliance";
import type { WorkoutSnapshot } from "@/modules/school/domain/workout";
import type { WorkoutExecution } from "@/modules/school/domain/workout-execution";
import { WorkoutMatchStatus } from "@/modules/school/domain/enums";

// ---------------------------------------------------------------------------
// T213 — Fixture dataset
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<{
  distanceM: number; durationS: number; heartRateMin: number; heartRateMax: number; power: number; blockType: string;
}> = {}): WorkoutSnapshot {
  const { distanceM = 10000, durationS = 3600, heartRateMin = 140, heartRateMax = 160, power = 200, blockType = "WORK" } = overrides;
  return {
    templateId: null,
    templateVersion: null,
    title: "Test Workout",
    description: null,
    sportType: "run",
    content: {
      blocks: [
        { id: "b1", blockType, distanceM, durationS, targetPayload: { heartRateMin, heartRateMax, power }, restPayload: null },
      ],
    },
  };
}

function makeExecution(overrides: Partial<WorkoutExecution> = {}): WorkoutExecution {
  return {
    id: "exec-1",
    workoutAssignmentId: "asgn-1",
    athleteId: "athlete-1",
    source: "strava",
    externalId: "strava-1",
    activityId: null,
    sportType: "run",
    startedAt: new Date("2026-10-08T07:00:00Z"),
    durationSeconds: 3600,
    movingSeconds: 3400,
    distanceMeters: 10000,
    averageHeartRate: 150,
    maxHeartRate: 175,
    averageSpeed: 2.78, // ~10 km/h
    elevationGain: 50,
    averagePower: 200,
    matchScore: 85,
    matchStatus: WorkoutMatchStatus.CONFIRMED,
    activityPayload: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T197 — Distance score function
// ---------------------------------------------------------------------------

describe("T197 — complianceDistanceScore", () => {
  it("returns 100 for exact match",                 () => expect(complianceDistanceScore(makeSnapshot(), makeExecution())).toBe(100));
  it("returns 90 for 8% deviation",                 () => expect(complianceDistanceScore(makeSnapshot(), makeExecution({ distanceMeters: 9200 }))).toBe(90));
  it("returns null when execution has no distance", () => expect(complianceDistanceScore(makeSnapshot(), makeExecution({ distanceMeters: null }))).toBeNull());
  it("returns null when snapshot has no distance",  () => expect(complianceDistanceScore(makeSnapshot({ distanceM: 0 }), makeExecution())).toBeNull());
});

// ---------------------------------------------------------------------------
// T198 — Duration score function
// ---------------------------------------------------------------------------

describe("T198 — complianceDurationScore", () => {
  it("returns 100 for exact movingSeconds match",    () => expect(complianceDurationScore(makeSnapshot({ durationS: 3400 }), makeExecution())).toBe(100));
  it("uses durationSeconds as fallback",             () => {
    const exec = makeExecution({ movingSeconds: null, durationSeconds: 3600 });
    expect(complianceDurationScore(makeSnapshot(), exec)).toBe(100);
  });
  it("returns null when no duration in execution",   () => expect(complianceDurationScore(makeSnapshot(), makeExecution({ durationSeconds: null, movingSeconds: null }))).toBeNull());
});

// ---------------------------------------------------------------------------
// T199 — Pace score function
// ---------------------------------------------------------------------------

describe("T199 — compliancePaceScore", () => {
  it("returns 100 when actual speed equals target", () => {
    // Target: 10000m / 3600s = 2.778 m/s
    expect(compliancePaceScore(makeSnapshot(), makeExecution({ averageSpeed: 2.778 }))).toBe(100);
  });
  it("returns null when no average speed",          () => expect(compliancePaceScore(makeSnapshot(), makeExecution({ averageSpeed: null }))).toBeNull());
  it("returns null when no distance or duration in snapshot", () => expect(compliancePaceScore(makeSnapshot({ distanceM: 0 }), makeExecution())).toBeNull());
});

// ---------------------------------------------------------------------------
// T200 — Heart rate score function
// ---------------------------------------------------------------------------

describe("T200 — complianceHeartRateScore", () => {
  it("returns 100 when HR is at zone midpoint (150)",   () => expect(complianceHeartRateScore(makeSnapshot(), makeExecution({ averageHeartRate: 150 }))).toBe(100));
  it("returns lower score when HR deviates from zone",  () => {
    const score = complianceHeartRateScore(makeSnapshot(), makeExecution({ averageHeartRate: 180 }));
    expect(score).toBeDefined();
    expect(score!).toBeLessThan(100);
  });
  it("returns null when no HR in execution",            () => expect(complianceHeartRateScore(makeSnapshot(), makeExecution({ averageHeartRate: null }))).toBeNull());
  it("returns null when no HR target in snapshot",      () => {
    const snap = { ...makeSnapshot(), content: { blocks: [{ id: "b1", blockType: "WORK", distanceM: 10000, durationS: 3600, targetPayload: null }] } };
    expect(complianceHeartRateScore(snap, makeExecution())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T201 — Power score function
// ---------------------------------------------------------------------------

describe("T201 — compliancePowerScore", () => {
  it("returns 100 for exact power match",       () => expect(compliancePowerScore(makeSnapshot(), makeExecution({ averagePower: 200 }))).toBe(100));
  it("returns null when no power in execution", () => expect(compliancePowerScore(makeSnapshot(), makeExecution({ averagePower: null }))).toBeNull());
});

// ---------------------------------------------------------------------------
// T202 — Intervals score function
// ---------------------------------------------------------------------------

describe("T202 — complianceIntervalsScore", () => {
  it("returns 100 when interval time is fully covered", () => {
    const snap = makeSnapshot({ blockType: "INTERVAL", durationS: 3600 });
    const exec = makeExecution({ movingSeconds: 3600 });
    expect(complianceIntervalsScore(snap, exec)).toBe(100);
  });
  it("returns null when no interval blocks",            () => {
    const snap = makeSnapshot({ blockType: "WARM_UP" });
    expect(complianceIntervalsScore(snap, makeExecution())).toBeNull();
  });
  it("returns null when no duration in execution",      () => expect(complianceIntervalsScore(makeSnapshot({ blockType: "INTERVAL" }), makeExecution({ durationSeconds: null, movingSeconds: null }))).toBeNull());
});

// ---------------------------------------------------------------------------
// T203 — Rest compliance score
// ---------------------------------------------------------------------------

describe("T203 — complianceRestScore", () => {
  it("returns high score when moving ratio matches expected", () => {
    const snap: WorkoutSnapshot = {
      ...makeSnapshot(),
      content: {
        blocks: [
          { id: "b1", blockType: "WORK",     durationS: 2700, distanceM: 7500, targetPayload: null },
          { id: "b2", blockType: "REST",     durationS:  900, distanceM: null, targetPayload: null },
        ],
      },
    };
    // expected moving ratio = 2700/3600 = 0.75; actual = movingSeconds/durationSeconds
    const exec = makeExecution({ movingSeconds: 2700, durationSeconds: 3600 });
    const score = complianceRestScore(snap, exec);
    expect(score).toBeDefined();
    expect(score!).toBeGreaterThanOrEqual(80);
  });

  it("returns null when no rest blocks", () => {
    expect(complianceRestScore(makeSnapshot(), makeExecution())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T211 — Tests per sport modality (strategies)
// ---------------------------------------------------------------------------

describe("T211 — RunComplianceStrategy", () => {
  it("produces a score between 0 and 100", () => {
    const result = RunComplianceStrategy.calculate(makeSnapshot(), makeExecution());
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.strategyKey).toBe("run");
  });

  it("scores 100 for a perfect run execution", () => {
    const snap = makeSnapshot({ distanceM: 10000, durationS: 3600, heartRateMin: 145, heartRateMax: 155 });
    const exec = makeExecution({ distanceMeters: 10000, movingSeconds: 3600, averageHeartRate: 150, averageSpeed: 10000 / 3600 });
    const result = RunComplianceStrategy.calculate(snap, exec);
    expect(result.overallScore).toBe(100);
  });

  it("scores lower when distance is significantly under target", () => {
    const exec = makeExecution({ distanceMeters: 6000 }); // 40% short
    const result = RunComplianceStrategy.calculate(makeSnapshot(), exec);
    expect(result.overallScore).toBeLessThan(80);
  });

  it("breakdown includes distance, duration and pace", () => {
    const result = RunComplianceStrategy.calculate(makeSnapshot(), makeExecution());
    expect(result.breakdown).toHaveProperty("distance");
    expect(result.breakdown).toHaveProperty("duration");
    expect(result.breakdown).toHaveProperty("pace");
  });
});

describe("T211 — SwimComplianceStrategy", () => {
  it("produces a valid score and strategyKey=swim", () => {
    const snap = makeSnapshot({ distanceM: 2000, durationS: 1800 });
    const exec = makeExecution({ sportType: "swim", distanceMeters: 2000, movingSeconds: 1800, averageSpeed: 2000 / 1800 });
    const result = SwimComplianceStrategy.calculate(snap, exec);
    expect(result.strategyKey).toBe("swim");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("T211 — BikeComplianceStrategy", () => {
  it("weighs power heavily and produces valid score", () => {
    const result = BikeComplianceStrategy.calculate(makeSnapshot(), makeExecution({ sportType: "bike" }));
    expect(result.strategyKey).toBe("bike");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("scores high when power is on target", () => {
    const result = BikeComplianceStrategy.calculate(makeSnapshot(), makeExecution({ sportType: "bike", averagePower: 200 }));
    expect(result.breakdown.power).toBe(100);
  });
});

describe("T211 — DefaultComplianceStrategy", () => {
  it("falls back gracefully with missing HR", () => {
    const exec = makeExecution({ averageHeartRate: null });
    const result = DefaultComplianceStrategy.calculate(makeSnapshot(), exec);
    expect(result.strategyKey).toBe("default");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("SAM-48 — all data absent is \"sem dados\" (null), never a score of 0", () => {
    const exec = makeExecution({ distanceMeters: null, durationSeconds: null, movingSeconds: null, averageHeartRate: null });
    const result = DefaultComplianceStrategy.calculate(makeSnapshot(), exec);
    expect(result.overallScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WorkoutComplianceService — strategy resolution
// ---------------------------------------------------------------------------

describe("resolveComplianceStrategy", () => {
  it("resolves run → RunComplianceStrategy",       () => expect(resolveComplianceStrategy("run").key).toBe("run"));
  it("resolves trail-run → RunComplianceStrategy", () => expect(resolveComplianceStrategy("trail-run").key).toBe("run"));
  it("resolves swim → SwimComplianceStrategy",     () => expect(resolveComplianceStrategy("swim").key).toBe("swim"));
  it("resolves open-water → SwimComplianceStrategy", () => expect(resolveComplianceStrategy("open-water").key).toBe("swim"));
  it("resolves bike → BikeComplianceStrategy",     () => expect(resolveComplianceStrategy("bike").key).toBe("bike"));
  it("resolves mtb → BikeComplianceStrategy",      () => expect(resolveComplianceStrategy("mtb").key).toBe("bike"));
  it("resolves unknown → DefaultComplianceStrategy", () => expect(resolveComplianceStrategy("yoga").key).toBe("default"));
});

describe("calculateCompliance", () => {
  it("delegates to the correct strategy by sport", () => {
    const snap = makeSnapshot();
    const exec = makeExecution({ sportType: "run" });
    const result = calculateCompliance(snap, exec);
    expect(result.strategyKey).toBe("run");
  });
});

// ---------------------------------------------------------------------------
// T212 — Algorithm version test
// ---------------------------------------------------------------------------

describe("T212 — COMPLIANCE_ALGORITHM_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(COMPLIANCE_ALGORITHM_VERSION)).toBe(true);
    expect(COMPLIANCE_ALGORITHM_VERSION).toBeGreaterThan(0);
  });

  it("equals 4 since SAM-72 (adherence + coverage in the breakdown; rows at 1–3 keep their version)", () => {
    expect(COMPLIANCE_ALGORITHM_VERSION).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// SAM-19 — formula v2: repetitions, main blocks, laps, zones
// ---------------------------------------------------------------------------

function makeStructuredSnapshot(blocks: Array<Record<string, unknown>>, sportType = "run"): WorkoutSnapshot {
  return {
    templateId: null, templateVersion: null, title: "v2", description: null, sportType,
    content: { blocks } as unknown as WorkoutSnapshot["content"],
  };
}

const FOUR_BY_ONE_KM = makeStructuredSnapshot([
  { id: "w", blockType: "WARMUP", durationS: 600, distanceM: null, repetitions: null, targetPayload: { heartRateMin: 110, heartRateMax: 130 }, restPayload: null },
  { id: "i", blockType: "INTERVAL", durationS: 300, distanceM: 1000, repetitions: 4, targetPayload: { heartRateMin: 160, heartRateMax: 175, paceSecPerKm: 300 }, restPayload: { durationS: 120 } },
]);

describe("SAM-19 — repetitions and rest in the planned totals", () => {
  it("4×1 km with 2 min rest, run as 4 km in ~28 min of effort, scores high", () => {
    const execution = makeExecution({
      sportType: "run", distanceMeters: 4000, durationSeconds: 28 * 60 + 600, movingSeconds: 20 * 60 + 600,
      averageSpeed: 4000 / 1200, averageHeartRate: 168, averagePower: null,
    });
    expect(complianceDistanceScore(FOUR_BY_ONE_KM, execution)).toBe(100);
    const result = calculateCompliance(FOUR_BY_ONE_KM, execution);
    expect(result.breakdown.distance).toBe(100);
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
  });

  it("the same execution against a 1 km prescription scores low (4 km ≠ 1 km)", () => {
    const oneKm = makeStructuredSnapshot([
      { id: "i", blockType: "INTERVAL", durationS: 300, distanceM: 1000, repetitions: 1, targetPayload: {}, restPayload: null },
    ]);
    const execution = makeExecution({ sportType: "run", distanceMeters: 4000, durationSeconds: 1680, movingSeconds: 1200, averageSpeed: 4000 / 1200, averageHeartRate: null, averagePower: null });
    expect(complianceDistanceScore(oneKm, execution)).toBe(0);
    expect(calculateCompliance(oneKm, execution).overallScore).toBeLessThan(40);
  });

  it("planned duration counts rest between repetitions (SAM-48): 10 min + 4×5 + 3×2 = 36 min, compared to elapsed time when rest is prescribed", () => {
    const onTime = makeExecution({ durationSeconds: 36 * 60, movingSeconds: 30 * 60 });
    expect(complianceDurationScore(FOUR_BY_ONE_KM, onTime)).toBe(100);
    const rushed = makeExecution({ durationSeconds: 25 * 60, movingSeconds: 24 * 60 });
    expect(complianceDurationScore(FOUR_BY_ONE_KM, rushed)).toBe(30);
  });

  it("intervals use reps too: 4×5 min = 20 min of intervals", () => {
    expect(complianceIntervalsScore(FOUR_BY_ONE_KM, makeExecution({ movingSeconds: 1200 }))).toBe(100);
    expect(complianceIntervalsScore(FOUR_BY_ONE_KM, makeExecution({ movingSeconds: 600 }))).toBe(30);
  });
});

describe("SAM-19 — intensity against the main blocks, not the warm-up", () => {
  it("an interval session with a Z1 warm-up is judged against the Z4 intervals", () => {
    // Average 168 bpm sits in the intervals' range (160–175, midpoint 167.5); v1 would have compared to the warm-up's 120.
    expect(complianceHeartRateScore(FOUR_BY_ONE_KM, makeExecution({ averageHeartRate: 168 }))).toBe(100);
    expect(complianceHeartRateScore(FOUR_BY_ONE_KM, makeExecution({ averageHeartRate: 120 }))).toBe(50);
  });

  it("pace target comes from the intervals' pace, duration-weighted", () => {
    // 5:00/km target → 3.33 m/s.
    expect(compliancePaceScore(FOUR_BY_ONE_KM, makeExecution({ averageSpeed: 1000 / 300 }))).toBe(100);
    expect(compliancePaceScore(FOUR_BY_ONE_KM, makeExecution({ averageSpeed: 1000 / 360 }))).toBe(70);
  });

  it("without any main-block target the summary is used, never the warm-up's", () => {
    const warmupOnlyTarget = makeStructuredSnapshot([
      { id: "w", blockType: "WARMUP", durationS: 600, distanceM: null, repetitions: null, targetPayload: { heartRateMin: 110, heartRateMax: 130 }, restPayload: null },
      { id: "s", blockType: "STEADY", durationS: 1800, distanceM: 6000, repetitions: null, targetPayload: {}, restPayload: null },
    ]);
    expect(complianceHeartRateScore(warmupOnlyTarget, makeExecution({ averageHeartRate: 150 }))).toBeNull();
    // Pace from planned distance over the main effort time: 6000 m / 1800 s.
    expect(compliancePaceScore(warmupOnlyTarget, makeExecution({ averageSpeed: 6000 / 1800 }))).toBe(100);
  });
});

describe("SAM-19 — laps aligned with the structure", () => {
  // warm-up, rep1, rest, rep2, rest, rep3, rest, rep4 = 8 laps ("rest between reps").
  const laps = [
    { index: 1, durationSeconds: 600, distanceMeters: 2000, averageSpeed: null, averageHeartRate: 120, maxHeartRate: null, averagePower: null },
    { index: 2, durationSeconds: 300, distanceMeters: 1000, averageSpeed: 1000 / 300, averageHeartRate: 165, maxHeartRate: null, averagePower: null },
    { index: 3, durationSeconds: 120, distanceMeters: 200, averageSpeed: null, averageHeartRate: 125, maxHeartRate: null, averagePower: null },
    { index: 4, durationSeconds: 300, distanceMeters: 1000, averageSpeed: 1000 / 300, averageHeartRate: 170, maxHeartRate: null, averagePower: null },
    { index: 5, durationSeconds: 120, distanceMeters: 200, averageSpeed: null, averageHeartRate: 125, maxHeartRate: null, averagePower: null },
    { index: 6, durationSeconds: 300, distanceMeters: 1000, averageSpeed: 1000 / 300, averageHeartRate: 172, maxHeartRate: null, averagePower: null },
    { index: 7, durationSeconds: 120, distanceMeters: 200, averageSpeed: null, averageHeartRate: 125, maxHeartRate: null, averagePower: null },
    { index: 8, durationSeconds: 300, distanceMeters: 1000, averageSpeed: 1000 / 330, averageHeartRate: 190, maxHeartRate: null, averagePower: null },
  ];
  const execution = makeExecution({ sportType: "run", averageHeartRate: 150, averageSpeed: 2.5, averagePower: null });

  it("heart rate and pace are scored per block from the laps (the average is ignored)", () => {
    // Work laps: warm-up 120 (target 120 → 100), reps 165/170/172 (target 167.5 → 100) and 190 (13% → 80).
    // Duration-weighted: (600×100 + 300×100×3 + 300×80) / 1800 ≈ 97.
    expect(complianceHeartRateScore(FOUR_BY_ONE_KM, execution, { laps })).toBe(97);
    // Pace: three reps on target, the last 10% slower (90); the warm-up has no pace target.
    expect(compliancePaceScore(FOUR_BY_ONE_KM, execution, { laps })).toBe(98);
  });

  it("zones = share of effort time inside the prescribed range", () => {
    // 600 s warm-up in range + 900 s of reps in range; the last rep (190 bpm) is out → 1500/1800.
    expect(complianceZonesScore(FOUR_BY_ONE_KM, execution, { laps })).toBe(83);
  });

  it("falls back to the summary when the laps do not align, and zones stays null", () => {
    const misaligned = { laps: laps.slice(0, 3) };
    expect(complianceHeartRateScore(FOUR_BY_ONE_KM, execution, misaligned)).toBe(80); // 150 vs 167.5 (10% off)
    expect(complianceZonesScore(FOUR_BY_ONE_KM, execution, misaligned)).toBeNull();
    expect(complianceZonesScore(FOUR_BY_ONE_KM, execution)).toBeNull();
  });

  it("the run strategy carries zones in the breakdown and omits absent dimensions", () => {
    const result = RunComplianceStrategy.calculate(FOUR_BY_ONE_KM, execution, { laps });
    expect(result.breakdown.zones).toBe(83);
    expect(result.breakdown).not.toHaveProperty("power");
  });
});
