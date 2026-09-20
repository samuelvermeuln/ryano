/**
 * Structural tests for the PlannedWorkoutProvider contract.
 * Verifies that the Garmin implementation satisfies the interface at compile-time
 * and that the contract itself is coherent.
 */
import { describe, it, expect } from "vitest";
import type { PlannedWorkoutProvider, PlannedWorkoutStep } from "@/modules/shared/integrations/contracts";
import { GarminPlannedWorkoutProvider } from "@/modules/garmin/application/planned-workout-provider";

describe("PlannedWorkoutProvider contract", () => {
  it("GarminPlannedWorkoutProvider satisfies PlannedWorkoutProvider interface", () => {
    // This is a compile-time check; if tsc passes, the assignment is valid.
    const _provider: PlannedWorkoutProvider = {} as GarminPlannedWorkoutProvider;
    expect(_provider).toBeDefined();
  });

  it("GarminPlannedWorkoutProvider has pushWorkout and deleteWorkout methods", () => {
    const provider = new GarminPlannedWorkoutProvider();
    expect(typeof provider.pushWorkout).toBe("function");
    expect(typeof provider.deleteWorkout).toBe("function");
  });
});

describe("PlannedWorkoutStep type", () => {
  it("accepts all valid stepType values", () => {
    const validTypes: PlannedWorkoutStep["stepType"][] = [
      "WARMUP", "INTERVAL", "STEADY", "RECOVERY", "COOLDOWN", "DRILL", "FREE", "CUSTOM",
    ];
    // Type-level check: if TypeScript accepts this array, all values are valid.
    expect(validTypes).toHaveLength(8);
  });
});
