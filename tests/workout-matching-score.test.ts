/**
 * T181 — Unit tests for individual match score dimensions and the composite score.
 * T182 — Tests for correct match scenarios.
 * T183 — Tests for ambiguous/no-match scenarios.
 */
import { describe, expect, it } from "vitest";
import {
  computeMatchScore,
  scoreDate,
  scoreDistance,
  scoreDuration,
  scoreStructural,
  scoreSport,
  scoreTimeProximity,
  STRONG_MATCH_THRESHOLD,
  WEAK_MATCH_THRESHOLD,
} from "@/modules/school/domain/workout-matching";
import type { ActivitySummary } from "@/modules/school/domain/training-activity-reader";

// ---------------------------------------------------------------------------
// T181 — Dimension unit tests
// ---------------------------------------------------------------------------

describe("T181 — scoreSport", () => {
  it("returns 100 for exact match", () => expect(scoreSport("run", "run")).toBe(100));
  it("returns 0 for mismatch",      () => expect(scoreSport("run", "swim")).toBe(0));
  it("is case-sensitive",           () => expect(scoreSport("Run", "run")).toBe(0));
});

describe("T181 — scoreDate", () => {
  const base = new Date("2026-10-08T09:00:00Z");
  it("returns 100 on same day",           () => expect(scoreDate(base, new Date("2026-10-08T14:00:00Z"))).toBe(100));
  it("returns 70 one day off",            () => expect(scoreDate(base, new Date("2026-10-09T09:00:00Z"))).toBe(70));
  it("returns 40 two days off",           () => expect(scoreDate(base, new Date("2026-10-10T09:00:00Z"))).toBe(40));
  it("returns 10 three days off",         () => expect(scoreDate(base, new Date("2026-10-11T09:00:00Z"))).toBe(10));
  it("returns 0 more than three days off",() => expect(scoreDate(base, new Date("2026-10-15T09:00:00Z"))).toBe(0));
  it("returns 50 when no scheduled date", () => expect(scoreDate(null, base)).toBe(50));
  it("is symmetric",                      () => expect(scoreDate(base, new Date("2026-10-07T09:00:00Z"))).toBe(70));
});

describe("T181 — scoreTimeProximity", () => {
  const base = new Date("2026-10-08T07:00:00Z");
  it("returns 100 within 30 minutes (20 min diff)",   () => expect(scoreTimeProximity(base, new Date("2026-10-08T07:20:00Z"))).toBe(100));
  it("returns 80 within 60 minutes (45 min diff)",    () => expect(scoreTimeProximity(base, new Date("2026-10-08T07:45:00Z"))).toBe(80));
  it("returns 50 within 120 minutes (90 min diff)",   () => expect(scoreTimeProximity(base, new Date("2026-10-08T08:30:00Z"))).toBe(50));
  it("returns 20 within 180 minutes (150 min diff)",  () => expect(scoreTimeProximity(base, new Date("2026-10-08T09:30:00Z"))).toBe(20));
  it("returns 0 over 180 minutes (300 min diff)",     () => expect(scoreTimeProximity(base, new Date("2026-10-08T12:00:00Z"))).toBe(0));
  it("returns 50 when no scheduled time",             () => expect(scoreTimeProximity(null, base)).toBe(50));
});

describe("T181 — scoreDuration", () => {
  // prescribed = 3600 s; deviations computed as |actual/prescribed - 1|
  it("returns 100 for exact match",              () => expect(scoreDuration(3600, 3600)).toBe(100));
  it("returns 100 for ≤10% deviation (5.6%)",   () => expect(scoreDuration(3600, 3800)).toBe(100));
  it("returns 80 for 10–20% deviation (13.9%)", () => expect(scoreDuration(3600, 4100)).toBe(80));
  it("returns 60 for 20–30% deviation (25%)",   () => expect(scoreDuration(3600, 4500)).toBe(60));
  it("returns 30 for 30–40% deviation (36.1%)", () => expect(scoreDuration(3600, 4900)).toBe(30));
  it("returns 10 for 40–50% deviation (44.4%)", () => expect(scoreDuration(3600, 5200)).toBe(10));
  it("returns 0 for >50% deviation (108%)",      () => expect(scoreDuration(3600, 7500)).toBe(0));
  it("returns 50 when prescribed is missing",    () => expect(scoreDuration(null, 3600)).toBe(50));
  it("returns 50 when actual is missing",        () => expect(scoreDuration(3600, null)).toBe(50));
});

describe("T181 — scoreDistance", () => {
  it("returns 100 for ≤10% deviation",   () => expect(scoreDistance(10000, 10500)).toBe(100));
  it("returns 0 for >50% deviation",     () => expect(scoreDistance(10000, 20000)).toBe(0));
  it("returns 50 when either is missing",() => expect(scoreDistance(null, 10000)).toBe(50));
});

describe("T181 — scoreStructural", () => {
  it("returns 100 for ≤15% deviation",     () => expect(scoreStructural(4, 4)).toBe(100));
  it("returns 70 for 15–30% deviation",    () => expect(scoreStructural(4, 3)).toBe(70));
  it("returns 40 for 30–50% deviation",    () => expect(scoreStructural(4, 2)).toBe(40));
  it("returns 50 when segment count absent",() => expect(scoreStructural(4, null)).toBe(50));
});

// ---------------------------------------------------------------------------
// T182 — Correct match scenarios (composite)
// ---------------------------------------------------------------------------

const perfectActivity: ActivitySummary = {
  source: "strava",
  externalId: "activity-1",
  sportType: "run",
  providerSportType: "Run",
  startedAt: new Date("2026-10-08T07:05:00Z"),
  durationSeconds: 3600,
  distanceMeters: 10000,
};

const prescribedWorkout = {
  sportType: "run",
  scheduledDate: new Date("2026-10-08T00:00:00Z"),
  scheduledStartAt: new Date("2026-10-08T07:00:00Z"),
};

describe("T182 — computeMatchScore correct match", () => {
  it("scores high for a near-perfect match", () => {
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: 3600,
      prescribedDistanceMeters: 10000,
      blockCount: 3,
      activity: perfectActivity,
    });
    expect(result.composite).toBeGreaterThanOrEqual(STRONG_MATCH_THRESHOLD);
  });

  it("returns all expected dimensions when sport matches", () => {
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: 3600,
      prescribedDistanceMeters: 10000,
      blockCount: 3,
      activity: perfectActivity,
    });
    const names = result.dimensions.map((d) => d.dimension);
    expect(names).toContain("sport");
    expect(names).toContain("date");
    expect(names).toContain("duration");
  });

  it("scores at least WEAK_MATCH even with missing optional fields", () => {
    const sparseActivity: ActivitySummary = {
      source: "garmin",
      externalId: "g-1",
      sportType: "run",
      providerSportType: "running",
      startedAt: new Date("2026-10-08T07:10:00Z"),
    };
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: null,
      prescribedDistanceMeters: null,
      blockCount: 1,
      activity: sparseActivity,
    });
    expect(result.composite).toBeGreaterThanOrEqual(WEAK_MATCH_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// T183 — Ambiguous / no-match scenarios
// ---------------------------------------------------------------------------

describe("T183 — computeMatchScore no/ambiguous match", () => {
  it("scores 0 when sport does not match (hard block)", () => {
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: 3600,
      prescribedDistanceMeters: 10000,
      blockCount: 3,
      activity: { ...perfectActivity, sportType: "swim" },
    });
    expect(result.composite).toBe(0);
    expect(result.dimensions.length).toBe(1);
  });

  it("scores below STRONG threshold when date is 2 days off", () => {
    const lateActivity: ActivitySummary = {
      ...perfectActivity,
      startedAt: new Date("2026-10-10T07:05:00Z"), // 2 days late
    };
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: 3600,
      prescribedDistanceMeters: 10000,
      blockCount: 3,
      activity: lateActivity,
    });
    expect(result.composite).toBeLessThan(STRONG_MATCH_THRESHOLD);
  });

  it("scores below STRONG threshold when date is far off and metrics are neutral", () => {
    // 12 days late, no duration/distance — date and time sub-scores go to 0;
    // only sport (35) + neutral duration/distance/structural raise the composite.
    const veryLateActivity: ActivitySummary = {
      source: "strava",
      externalId: "activity-far",
      sportType: "run",
      providerSportType: "Run",
      startedAt: new Date("2026-10-20T07:05:00Z"),
      // no durationSeconds / distanceMeters → neutral sub-scores (50)
    };
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: null,
      prescribedDistanceMeters: null,
      blockCount: 3,
      activity: veryLateActivity,
    });
    expect(result.composite).toBeLessThan(STRONG_MATCH_THRESHOLD);
  });

  it("sports and date match but duration/distance very wrong — stays below STRONG", () => {
    const shortActivity: ActivitySummary = {
      ...perfectActivity,
      durationSeconds: 600,    // 10 min vs 60 min prescribed
      distanceMeters: 1000,    // 1 km vs 10 km
    };
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: 3600,
      prescribedDistanceMeters: 10000,
      blockCount: 3,
      activity: shortActivity,
    });
    expect(result.composite).toBeLessThan(STRONG_MATCH_THRESHOLD);
  });

  it("weights sum to 1.0 (dimension invariant)", () => {
    const result = computeMatchScore({
      workout: prescribedWorkout,
      prescribedDurationSeconds: 3600,
      prescribedDistanceMeters: 10000,
      blockCount: 3,
      activity: perfectActivity,
    });
    const totalWeight = result.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });
});
