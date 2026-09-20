/**
 * Unit tests for GarminPlannedWorkoutProvider
 * Tests the mapper (PlannedWorkoutInput → GarminWorkoutDTO) and the provider logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// ---------------------------------------------------------------------------
vi.mock("@/server/env", () => ({ requireEnv: () => "http://garmin-service.test" }));

// Shared mock client instance — singleton is set once, so we share the same fns
const mockPost = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/http-client", () => ({
  createHttpClient: () => ({ post: mockPost, delete: mockDelete }),
}));
vi.mock("@/modules/shared/integrations/observability", () => ({
  logIntegrationEvent: vi.fn(),
}));

import { GarminPlannedWorkoutProvider } from "@/modules/garmin/application/planned-workout-provider";
import type { PlannedWorkoutInput } from "@/modules/shared/integrations/contracts";

const BASE_INPUT: PlannedWorkoutInput = {
  accountApiKey: "test-api-key",
  title: "Treino Intervalo 4×1km",
  sportType: "running",
  scheduledAt: new Date("2026-09-20T08:00:00Z"),
  workoutAssignmentId: "assignment-1",
  steps: [
    {
      stepType: "WARMUP",
      title: "Aquecimento",
      durationSeconds: 600,
      target: { heartRateMin: 110, heartRateMax: 130 },
    },
    {
      stepType: "INTERVAL",
      title: "1 km em pace",
      distanceMeters: 1000,
      repetitions: 4,
      target: { paceSecPerKm: 240 }, // 4:00/km
      rest: { durationSeconds: 120 },
    },
    {
      stepType: "COOLDOWN",
      durationSeconds: 300,
      target: null,
    },
  ],
};

describe("GarminPlannedWorkoutProvider", () => {
  let provider: GarminPlannedWorkoutProvider;

  beforeEach(() => {
    mockPost.mockReset();
    mockDelete.mockReset();
    provider = new GarminPlannedWorkoutProvider();
  });

  describe("pushWorkout", () => {
    it("returns externalWorkoutId on success (workoutId field)", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "garmin-123" } });
      const result = await provider.pushWorkout(BASE_INPUT);
      expect(result.externalWorkoutId).toBe("garmin-123");
    });

    it("also accepts 'id' field from proxy response", async () => {
      mockPost.mockResolvedValue({ data: { id: "garmin-456" } });
      const result = await provider.pushWorkout(BASE_INPUT);
      expect(result.externalWorkoutId).toBe("garmin-456");
    });

    it("throws when proxy returns no workout ID", async () => {
      mockPost.mockResolvedValue({ data: {} });
      await expect(provider.pushWorkout(BASE_INPUT)).rejects.toThrow("GARMIN_WORKOUT_PUSH_NO_ID");
    });

    it("sends correct sport type ID for running (1)", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-1" } });
      await provider.pushWorkout(BASE_INPUT);
      const body = mockPost.mock.calls[0]![1] as { workout: { sportType: { sportTypeId: number } } };
      expect(body.workout.sportType.sportTypeId).toBe(1);
    });

    it("sends correct sport type ID for swimming (5)", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-2" } });
      await provider.pushWorkout({ ...BASE_INPUT, sportType: "swimming" });
      const body = mockPost.mock.calls[0]![1] as { workout: { sportType: { sportTypeId: number } } };
      expect(body.workout.sportType.sportTypeId).toBe(5);
    });

    it("sends scheduledDate in YYYY-MM-DD format", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-3" } });
      await provider.pushWorkout(BASE_INPUT);
      const body = mockPost.mock.calls[0]![1] as { scheduledDate: string };
      expect(body.scheduledDate).toBe("2026-09-20");
    });

    it("uses X-API-Key header", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-4" } });
      await provider.pushWorkout(BASE_INPUT);
      const config = mockPost.mock.calls[0]![2] as { headers: Record<string, string> };
      expect(config.headers["X-API-Key"]).toBe("test-api-key");
    });

    it("maps WARMUP block with HR target", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-5" } });
      await provider.pushWorkout(BASE_INPUT);
      const body = mockPost.mock.calls[0]![1] as {
        workout: { workoutSegments: Array<{ workoutSteps: Array<{ stepType: string; targetType: { workoutTargetTypeKey: string }; targetValueOne: number; targetValueTwo: number }> }> };
      };
      const warmup = body.workout.workoutSegments[0]!.workoutSteps[0]!;
      expect(warmup.stepType).toBe("WARMUP");
      expect(warmup.targetType.workoutTargetTypeKey).toBe("HEART_RATE");
      expect(warmup.targetValueOne).toBe(110);
      expect(warmup.targetValueTwo).toBe(130);
    });

    it("maps INTERVAL block with SPEED target from paceSecPerKm", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-6" } });
      await provider.pushWorkout(BASE_INPUT);
      const body = mockPost.mock.calls[0]![1] as {
        workout: { workoutSegments: Array<{ workoutSteps: Array<{ stepType: string; targetType: { workoutTargetTypeKey: string } }> }> };
      };
      const interval = body.workout.workoutSegments[0]!.workoutSteps[1]!;
      expect(interval.stepType).toBe("INTERVAL");
      expect(interval.targetType.workoutTargetTypeKey).toBe("SPEED");
    });

    it("adds REST step after INTERVAL when rest.durationSeconds is set", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-7" } });
      await provider.pushWorkout(BASE_INPUT);
      const body = mockPost.mock.calls[0]![1] as {
        workout: { workoutSegments: Array<{ workoutSteps: Array<{ stepType: string }> }> };
      };
      const steps = body.workout.workoutSegments[0]!.workoutSteps;
      const restStep = steps.find((s) => s.stepType === "REST");
      expect(restStep).toBeDefined();
    });

    it("maps COOLDOWN with NO_TARGET when target is null", async () => {
      mockPost.mockResolvedValue({ data: { workoutId: "g-8" } });
      await provider.pushWorkout(BASE_INPUT);
      const body = mockPost.mock.calls[0]![1] as {
        workout: { workoutSegments: Array<{ workoutSteps: Array<{ stepType: string; targetType: { workoutTargetTypeKey: string } }> }> };
      };
      const cooldown = body.workout.workoutSegments[0]!.workoutSteps.find((s) => s.stepType === "COOLDOWN");
      expect(cooldown?.targetType.workoutTargetTypeKey).toBe("NO_TARGET");
    });

    it("truncates title to 50 chars", async () => {
      const longTitle = "A".repeat(80);
      mockPost.mockResolvedValue({ data: { workoutId: "g-9" } });
      await provider.pushWorkout({ ...BASE_INPUT, title: longTitle });
      const body = mockPost.mock.calls[0]![1] as { workout: { workoutName: string } };
      expect(body.workout.workoutName.length).toBe(50);
    });
  });

  describe("deleteWorkout", () => {
    it("calls DELETE /workouts/:id with correct key", async () => {
      mockDelete.mockResolvedValue({ status: 204, data: {} });
      await provider.deleteWorkout({ accountApiKey: "key-123", externalWorkoutId: "garmin-xyz" });
      expect(mockDelete).toHaveBeenCalledWith(
        "/workouts/garmin-xyz",
        expect.objectContaining({ headers: { "X-API-Key": "key-123" } }),
      );
    });

    it("silently ignores 404 (already removed)", async () => {
      mockDelete.mockRejectedValue({ response: { status: 404 } });
      await expect(provider.deleteWorkout({ accountApiKey: "k", externalWorkoutId: "gone" })).resolves.toBeUndefined();
    });

    it("propagates non-404 errors", async () => {
      mockDelete.mockRejectedValue({ response: { status: 500 }, message: "server error" });
      await expect(provider.deleteWorkout({ accountApiKey: "k", externalWorkoutId: "x" })).rejects.toBeDefined();
    });
  });
});
