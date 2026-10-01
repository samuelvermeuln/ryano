/**
 * SAM-19 — compliance is calculated automatically by the match flow (auto
 * match, confirmation, override), idempotently (upsert per execution), with
 * the lap reader injected and never fatal to the match.
 */
import { describe, expect, it, vi } from "vitest";
import { CalculateWorkoutCompliance } from "@/modules/school/application/calculate-workout-compliance";
import { MatchActivityToWorkout } from "@/modules/school/application/match-activity-to-workout";
import { ConfirmWorkoutMatch } from "@/modules/school/application/manage-workout-match";
import { COMPLIANCE_ALGORITHM_VERSION } from "@/modules/school/domain/workout-compliance";

const NOW = new Date("2026-10-08T07:00:00.000Z");

const snapshot = {
  templateId: null, templateVersion: null, title: "Tiros", description: null, sportType: "run",
  content: { blocks: [
    { id: "i", blockType: "INTERVAL", durationS: 300, distanceM: 1000, repetitions: 4, targetPayload: { heartRateMin: 160, heartRateMax: 175 }, restPayload: { durationS: 120 } },
  ] },
};

function executionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "exec-1", workoutAssignmentId: "asg-1", athleteId: "athlete-1", source: "GARMIN", externalId: "g-1",
    activityId: "act-1", sportType: "run", startedAt: NOW, durationSeconds: 1680, movingSeconds: 1200,
    distanceMeters: 4000, averageHeartRate: 168, maxHeartRate: 180, averageSpeed: 4000 / 1200, elevationGain: null,
    averagePower: null, matchScore: 90, matchStatus: "CONFIRMED", activityPayload: {}, createdAt: NOW, updatedAt: NOW,
    assignment: { workout: { snapshotPayload: snapshot } },
    activity: { id: "act-1", provider: "GARMIN" },
    ...overrides,
  };
}

/** A db whose compliance upsert records what it was given. */
function makeDb(execution: Record<string, unknown> | null) {
  const upserts: Array<Record<string, unknown>> = [];
  const db = {
    workoutExecution: {
      findUnique: vi.fn().mockResolvedValue(execution),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    workoutCompliance: {
      upsert: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        upserts.push(args);
        const create = args.create as Record<string, unknown>;
        return Promise.resolve({ ...create, athleteId: "athlete-1" });
      }),
    },
    workoutAssignment: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    activity: { findUnique: vi.fn().mockResolvedValue({ id: "act-1" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  return { db, upserts };
}

describe("CalculateWorkoutCompliance — v2 with the injected lap reader", () => {
  it("upserts one row per execution with the current algorithm version (idempotent key = executionId)", async () => {
    const { db, upserts } = makeDb(executionRow());
    const saved = await new CalculateWorkoutCompliance(db as never, () => NOW).execute({ executionId: "exec-1" });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].where).toEqual({ workoutExecutionId: "exec-1" });
    expect((upserts[0].create as { algorithmVersion: number }).algorithmVersion).toBe(COMPLIANCE_ALGORITHM_VERSION);
    expect(saved.overallScore).toBeGreaterThan(0);

    // Running again overwrites the same row: still one key, never a second record.
    await new CalculateWorkoutCompliance(db as never, () => NOW).execute({ executionId: "exec-1" });
    expect(upserts[1].where).toEqual({ workoutExecutionId: "exec-1" });
  });

  it("reads the laps through the loader and scores zones from them", async () => {
    const { db, upserts } = makeDb(executionRow());
    const laps = [
      { index: 1, durationSeconds: 300, distanceMeters: 1000, averageSpeed: null, averageHeartRate: 165, maxHeartRate: null, averagePower: null },
      { index: 2, durationSeconds: 120, distanceMeters: 200, averageSpeed: null, averageHeartRate: 120, maxHeartRate: null, averagePower: null },
      { index: 3, durationSeconds: 300, distanceMeters: 1000, averageSpeed: null, averageHeartRate: 168, maxHeartRate: null, averagePower: null },
      { index: 4, durationSeconds: 120, distanceMeters: 200, averageSpeed: null, averageHeartRate: 120, maxHeartRate: null, averagePower: null },
      { index: 5, durationSeconds: 300, distanceMeters: 1000, averageSpeed: null, averageHeartRate: 170, maxHeartRate: null, averagePower: null },
      { index: 6, durationSeconds: 120, distanceMeters: 200, averageSpeed: null, averageHeartRate: 120, maxHeartRate: null, averagePower: null },
      { index: 7, durationSeconds: 300, distanceMeters: 1000, averageSpeed: null, averageHeartRate: 185, maxHeartRate: null, averagePower: null },
    ];
    const loader = vi.fn().mockResolvedValue({ laps });
    await new CalculateWorkoutCompliance(db as never, () => NOW, loader).execute({ executionId: "exec-1" });

    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ id: "act-1" }));
    const breakdown = (upserts[0].create as { breakdown: Record<string, number> }).breakdown;
    expect(breakdown.zones).toBe(75); // 3 of 4 reps in range
    expect(breakdown.heartRate).toBeDefined();
  });

  it("a failing loader degrades to the summary formula instead of failing the calculation", async () => {
    const { db, upserts } = makeDb(executionRow());
    const loader = vi.fn().mockRejectedValue(new Error("provider down"));
    await new CalculateWorkoutCompliance(db as never, () => NOW, loader).execute({ executionId: "exec-1" });
    const breakdown = (upserts[0].create as { breakdown: Record<string, number> }).breakdown;
    expect(breakdown.zones).toBeUndefined();
    expect(breakdown.heartRate).toBe(100); // 168 vs 167.5
  });

  it("does not call the loader for an execution without a linked activity", async () => {
    const { db } = makeDb(executionRow({ activityId: null, activity: null }));
    const loader = vi.fn();
    await new CalculateWorkoutCompliance(db as never, () => NOW, loader).execute({ executionId: "exec-1" });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("auto-trigger from the match flow", () => {
  const assignment = {
    id: "asg-1", athleteId: "athlete-1", coachId: "coach-1", status: "SCHEDULED",
    workout: { sportType: "run", scheduledDate: NOW, scheduledStartAt: NOW, blocks: [{ durationS: 1200, distanceM: 4000 }] },
  };

  it("an AUTO_MATCHED execution is scored right after the match commits", async () => {
    const { db, upserts } = makeDb(executionRow({ matchStatus: "AUTO_MATCHED" }));
    db.workoutAssignment.findUnique.mockResolvedValue(assignment);
    db.workoutExecution.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data }));

    const saved = await new MatchActivityToWorkout(db as never, () => NOW).execute({
      workoutAssignmentId: "asg-1", athleteId: "athlete-1", source: "GARMIN", externalId: "g-1", sportType: "run",
      startedAt: NOW.toISOString(), durationSeconds: 1200, distanceMeters: 4000,
    });
    expect(saved.matchStatus).toBe("AUTO_MATCHED");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].where).toEqual({ workoutExecutionId: saved.id });
  });

  it("a PENDING match is not scored until it is confirmed", async () => {
    const { db, upserts } = makeDb(executionRow({ matchStatus: "PENDING" }));
    db.workoutAssignment.findUnique.mockResolvedValue({ ...assignment, workout: { ...assignment.workout, sportType: "swim" } });
    db.workoutExecution.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data }));

    const saved = await new MatchActivityToWorkout(db as never, () => NOW).execute({
      workoutAssignmentId: "asg-1", athleteId: "athlete-1", source: "GARMIN", externalId: "g-1", sportType: "run",
      startedAt: NOW.toISOString(), durationSeconds: 1200, distanceMeters: 4000,
    });
    expect(saved.matchStatus).toBe("PENDING");
    expect(upserts).toHaveLength(0);

    // Confirmation scores it.
    db.workoutExecution.findUnique.mockResolvedValue({ ...executionRow({ matchStatus: "PENDING" }), assignment: { athleteId: "athlete-1", coachId: "coach-1", workout: { snapshotPayload: snapshot } } });
    db.workoutExecution.update.mockResolvedValue(executionRow({ matchStatus: "CONFIRMED" }));
    await new ConfirmWorkoutMatch(db as never, () => NOW).execute("athlete-1", { executionId: "exec-1" });
    expect(upserts).toHaveLength(1);
  });

  it("a scoring failure never undoes the confirmation", async () => {
    const { db } = makeDb(executionRow({ matchStatus: "PENDING" }));
    db.workoutExecution.findUnique.mockResolvedValue({ ...executionRow({ matchStatus: "PENDING" }), assignment: { athleteId: "athlete-1", coachId: "coach-1", workout: null } });
    db.workoutExecution.update.mockResolvedValue(executionRow({ matchStatus: "CONFIRMED" }));
    await expect(new ConfirmWorkoutMatch(db as never, () => NOW).execute("athlete-1", { executionId: "exec-1" }))
      .resolves.toMatchObject({ matchStatus: "CONFIRMED" });
  });
});
