/**
 * T184 — Tests for ConfirmWorkoutMatch, OverrideWorkoutMatch, UnmatchActivity
 * Also covers T175 (confirm) and T177 (unmatch) as these were co-developed.
 */
import { describe, expect, it, vi } from "vitest";
import { ConfirmWorkoutMatch, OverrideWorkoutMatch, UnmatchActivity } from "@/modules/school/application/manage-workout-match";
import { WorkoutAssignmentStatus, WorkoutMatchStatus } from "@/modules/school/domain/enums";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-08T07:00:00Z");
const future = new Date("2026-10-08T07:05:00Z");

function makeDb(tx: object): PrismaClient {
  return { $transaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)) } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const assignment = {
  id: "asgn-1",
  workoutId: "wk-1",
  athleteId: "athlete-1",
  assignedBy: "user-coach",
  coachId: "coach-1",
  schoolId: "school-1",
  teamId: null,
  status: WorkoutAssignmentStatus.AVAILABLE,
  scheduledAt: future,
  dueAt: null,
  createdAt: now,
  updatedAt: now,
};

const workout = {
  id: "wk-1",
  sportType: "run",
  scheduledDate: new Date("2026-10-08T00:00:00Z"),
  scheduledStartAt: new Date("2026-10-08T07:00:00Z"),
  blocks: [{ durationS: 3600, distanceM: 10000 }],
};

function makeExecution(status: WorkoutMatchStatus) {
  return {
    id: "exec-1",
    workoutAssignmentId: "asgn-1",
    athleteId: "athlete-1",
    source: "strava",
    externalId: "strava-123",
    activityId: "act-strava-123",
    sportType: "run",
    startedAt: future,
    durationSeconds: 3600,
    movingSeconds: null,
    distanceMeters: 10000,
    averageHeartRate: null,
    maxHeartRate: null,
    averageSpeed: null,
    elevationGain: null,
    averagePower: null,
    matchScore: 85,
    matchStatus: status,
    activityPayload: {},
    createdAt: now,
    updatedAt: now,
    assignment: {
      athleteId: "athlete-1", coachId: "coach-1", status: WorkoutAssignmentStatus.AVAILABLE,
      matchedActivityId: "act-strava-123",
    },
  };
}

// ---------------------------------------------------------------------------
// ConfirmWorkoutMatch (T175)
// ---------------------------------------------------------------------------

describe("T175 — ConfirmWorkoutMatch", () => {
  function makeTx(execution: ReturnType<typeof makeExecution> | null, coachId?: string) {
    return {
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue(execution),
        update: vi.fn().mockResolvedValue({ ...execution, matchStatus: WorkoutMatchStatus.CONFIRMED }),
      },
      workoutAssignment: { update: vi.fn().mockResolvedValue({}) },
      coachProfile: { findUnique: vi.fn().mockResolvedValue(coachId ? { id: coachId } : null) },
    };
  }

  it("rejects unauthenticated caller", async () => {
    const uc = new ConfirmWorkoutMatch(makeDb(makeTx(makeExecution(WorkoutMatchStatus.AUTO_MATCHED))));
    await expect(uc.execute(null, { executionId: "exec-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects execution not found", async () => {
    const uc = new ConfirmWorkoutMatch(makeDb(makeTx(null)));
    await expect(uc.execute("athlete-1", { executionId: "exec-X" }))
      .rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
  });

  it("rejects caller who is neither athlete nor assigning coach", async () => {
    const tx = makeTx(makeExecution(WorkoutMatchStatus.AUTO_MATCHED), "coach-OTHER");
    const uc = new ConfirmWorkoutMatch(makeDb(tx));
    await expect(uc.execute("user-stranger", { executionId: "exec-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows athlete to confirm AUTO_MATCHED", async () => {
    const tx = makeTx(makeExecution(WorkoutMatchStatus.AUTO_MATCHED));
    const uc = new ConfirmWorkoutMatch(makeDb(tx), () => now);
    const result = await uc.execute("athlete-1", { executionId: "exec-1" });
    expect(result.matchStatus).toBe(WorkoutMatchStatus.CONFIRMED);
    expect(tx.workoutExecution.update).toHaveBeenCalledOnce();
    // SAM-17 — the confirmed execution becomes the assignment's matched activity.
    expect(tx.workoutAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "asgn-1" },
      data: expect.objectContaining({
        matchedActivityId: "act-strava-123", matchStatus: WorkoutMatchStatus.CONFIRMED, matchedAt: now, matchScore: 85,
      }),
    }));
  });

  it("allows assigning coach to confirm PENDING", async () => {
    const tx = makeTx(makeExecution(WorkoutMatchStatus.PENDING), "coach-1");
    const uc = new ConfirmWorkoutMatch(makeDb(tx), () => now);
    const result = await uc.execute("user-coach", { executionId: "exec-1" });
    expect(result.matchStatus).toBe(WorkoutMatchStatus.CONFIRMED);
  });

  it("is idempotent when already CONFIRMED", async () => {
    const tx = makeTx(makeExecution(WorkoutMatchStatus.CONFIRMED));
    const uc = new ConfirmWorkoutMatch(makeDb(tx), () => now);
    const result = await uc.execute("athlete-1", { executionId: "exec-1" });
    expect(result.matchStatus).toBe(WorkoutMatchStatus.CONFIRMED);
    expect(tx.workoutExecution.update).not.toHaveBeenCalled();
  });

  it("rejects confirming NO_MATCH execution", async () => {
    const tx = makeTx(makeExecution(WorkoutMatchStatus.NO_MATCH));
    const uc = new ConfirmWorkoutMatch(makeDb(tx), () => now);
    await expect(uc.execute("athlete-1", { executionId: "exec-1" }))
      .rejects.toMatchObject({ code: "EXECUTION_INVALID_TRANSITION" });
  });
});

// ---------------------------------------------------------------------------
// OverrideWorkoutMatch (T176 / T184)
// ---------------------------------------------------------------------------

const overrideInput = {
  workoutAssignmentId: "asgn-1",
  athleteId: "athlete-1",
  source: "garmin",
  externalId: "garmin-456",
  sportType: "run",
  startedAt: new Date("2026-10-08T07:10:00Z").toISOString(),
  durationSeconds: 3500,
  distanceMeters: 9800,
};

function makeOverrideTx(opts: {
  assignment?: object | null;
  coachId?: string | null;
  newExecution?: object;
} = {}) {
  const asgn = opts.assignment !== undefined ? opts.assignment : { ...assignment, workout };
  return {
    workoutAssignment: { findUnique: vi.fn().mockResolvedValue(asgn), update: vi.fn().mockResolvedValue({}) },
    // SAM-17 — the chosen activity exists as an imported row for this athlete.
    activity: { findUnique: vi.fn().mockResolvedValue({ id: "act-garmin-456" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(opts.coachId !== undefined ? (opts.coachId ? { id: opts.coachId } : null) : null) },
    workoutExecution: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({
        id: "exec-2",
        workoutAssignmentId: "asgn-1",
        athleteId: "athlete-1",
        source: "garmin",
        externalId: "garmin-456",
        activityId: data.activityId,
        sportType: "run",
        startedAt: new Date("2026-10-08T07:10:00Z"),
        matchScore: 82,
        matchStatus: WorkoutMatchStatus.OVERRIDDEN,
        activityPayload: {},
        createdAt: now,
        updatedAt: now,
        ...(opts.newExecution ?? {}),
      })),
    },
  };
}

describe("T176/T184 — OverrideWorkoutMatch", () => {
  it("rejects unauthenticated caller", async () => {
    const uc = new OverrideWorkoutMatch(makeDb(makeOverrideTx()), () => now);
    await expect(uc.execute(null, overrideInput))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects when assignment not found", async () => {
    const tx = makeOverrideTx({ assignment: null });
    const uc = new OverrideWorkoutMatch(makeDb(tx), () => now);
    await expect(uc.execute("athlete-1", overrideInput))
      .rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("rejects when athleteId doesn't match assignment", async () => {
    const tx = makeOverrideTx({ assignment: { ...assignment, workout, athleteId: "athlete-OTHER" } });
    const uc = new OverrideWorkoutMatch(makeDb(tx), () => now);
    await expect(uc.execute("athlete-1", overrideInput))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows athlete to override their own assignment", async () => {
    const tx = makeOverrideTx();
    const uc = new OverrideWorkoutMatch(makeDb(tx), () => now);
    const result = await uc.execute("athlete-1", overrideInput);
    expect(result.matchStatus).toBe(WorkoutMatchStatus.OVERRIDDEN);
    expect(tx.workoutExecution.updateMany).toHaveBeenCalledOnce();
    expect(tx.workoutExecution.create).toHaveBeenCalledOnce();
    // SAM-17 — "garmin" resolves to the GARMIN activity row and the assignment points at it.
    expect(tx.activity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { provider_externalId_userId: { provider: "GARMIN", externalId: "garmin-456", userId: "athlete-1" } },
    }));
    expect(tx.workoutExecution.create.mock.calls[0][0].data.activityId).toBe("act-garmin-456");
    expect(tx.workoutAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matchedActivityId: "act-garmin-456", matchStatus: WorkoutMatchStatus.OVERRIDDEN }),
    }));
  });

  it("allows assigning coach to override", async () => {
    const tx = makeOverrideTx({ coachId: "coach-1" });
    const uc = new OverrideWorkoutMatch(makeDb(tx), () => now);
    const result = await uc.execute("user-coach", overrideInput);
    expect(result.matchStatus).toBe(WorkoutMatchStatus.OVERRIDDEN);
  });

  it("rejects a coach who did not create the assignment", async () => {
    const tx = makeOverrideTx({ coachId: "coach-OTHER" });
    const uc = new OverrideWorkoutMatch(makeDb(tx), () => now);
    await expect(uc.execute("user-other-coach", overrideInput))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("supersedes previous AUTO_MATCHED/PENDING executions", async () => {
    const tx = makeOverrideTx();
    const uc = new OverrideWorkoutMatch(makeDb(tx), () => now);
    await uc.execute("athlete-1", overrideInput);
    expect(tx.workoutExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchStatus: WorkoutMatchStatus.NO_MATCH }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// UnmatchActivity (T177)
// ---------------------------------------------------------------------------

function makeUnmatchTx(opts: {
  execution?: ReturnType<typeof makeExecution> | null;
  coachId?: string | null;
  remainingCount?: number;
} = {}) {
  const exec = opts.execution !== undefined ? opts.execution : makeExecution(WorkoutMatchStatus.AUTO_MATCHED);
  return {
    workoutExecution: {
      findUnique: vi.fn().mockResolvedValue(exec),
      delete: vi.fn().mockResolvedValue(exec),
      count: vi.fn().mockResolvedValue(opts.remainingCount ?? 0),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(opts.coachId !== undefined ? (opts.coachId ? { id: opts.coachId } : null) : null) },
    workoutAssignment: {
      update: vi.fn().mockResolvedValue({ ...assignment, status: WorkoutAssignmentStatus.SCHEDULED }),
    },
  };
}

describe("T177 — UnmatchActivity", () => {
  it("rejects unauthenticated caller", async () => {
    const uc = new UnmatchActivity(makeDb(makeUnmatchTx()), () => now);
    await expect(uc.execute(null, { executionId: "exec-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects execution not found", async () => {
    const uc = new UnmatchActivity(makeDb(makeUnmatchTx({ execution: null })), () => now);
    await expect(uc.execute("athlete-1", { executionId: "exec-X" }))
      .rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
  });

  it("rejects unmatching a CONFIRMED execution", async () => {
    const uc = new UnmatchActivity(makeDb(makeUnmatchTx({ execution: makeExecution(WorkoutMatchStatus.CONFIRMED) })), () => now);
    await expect(uc.execute("athlete-1", { executionId: "exec-1" }))
      .rejects.toMatchObject({ code: "EXECUTION_INVALID_TRANSITION" });
  });

  it("rejects caller who is neither athlete nor coach", async () => {
    const uc = new UnmatchActivity(makeDb(makeUnmatchTx({ coachId: "coach-OTHER" })), () => now);
    await expect(uc.execute("user-stranger", { executionId: "exec-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deletes the execution and returns unmatched=true", async () => {
    const tx = makeUnmatchTx();
    const uc = new UnmatchActivity(makeDb(tx), () => now);
    const result = await uc.execute("athlete-1", { executionId: "exec-1" });
    expect(result).toEqual({ unmatched: true, executionId: "exec-1" });
    expect(tx.workoutExecution.delete).toHaveBeenCalledOnce();
  });

  it("reverts assignment to SCHEDULED when no remaining executions", async () => {
    const tx = makeUnmatchTx({ remainingCount: 0 });
    const uc = new UnmatchActivity(makeDb(tx), () => now);
    await uc.execute("athlete-1", { executionId: "exec-1" });
    expect(tx.workoutAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: WorkoutAssignmentStatus.SCHEDULED }) }),
    );
  });

  it("does NOT revert assignment when other executions still exist, but clears the pointer it held (SAM-17)", async () => {
    const tx = makeUnmatchTx({ remainingCount: 1 });
    const uc = new UnmatchActivity(makeDb(tx), () => now);
    await uc.execute("athlete-1", { executionId: "exec-1" });
    expect(tx.workoutAssignment.update).toHaveBeenCalledOnce();
    const data = tx.workoutAssignment.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data).toMatchObject({ matchedActivityId: null, matchStatus: null, matchedAt: null, matchScore: null });
  });

  it("leaves the pointer alone when the removed execution was not the matched one (SAM-17)", async () => {
    const execution = makeExecution(WorkoutMatchStatus.PENDING);
    execution.assignment.matchedActivityId = "act-other";
    const tx = makeUnmatchTx({ execution, remainingCount: 1 });
    const uc = new UnmatchActivity(makeDb(tx), () => now);
    await uc.execute("athlete-1", { executionId: "exec-1" });
    expect(tx.workoutAssignment.update).not.toHaveBeenCalled();
  });
});
