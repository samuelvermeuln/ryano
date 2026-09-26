import { expect, it } from "vitest";

import { WorkoutChangeRequestStatus } from "@/modules/school/domain/enums";
import {
  createWorkoutChangeRequest,
  transitionWorkoutChangeRequest,
  workoutChangeRequestSchema,
} from "@/modules/school/domain/workout-change-request";

const now = new Date("2026-09-16T12:00:00Z");
const later = new Date("2026-09-17T12:00:00Z");

const input = {
  id: "request",
  schoolId: "school",
  workoutAssignmentId: "assignment",
  coachId: "coach",
  requestedBy: "admin",
  reason: "A distância prescrita não confere com o combinado.",
};

const open = createWorkoutChangeRequest(input, now);

it("creates a pending request carrying no resolution", () => {
  expect(open).toMatchObject({
    status: WorkoutChangeRequestStatus.PENDING,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
  });
});

it("trims the reason and rejects an empty one", () => {
  expect(createWorkoutChangeRequest({ ...input, reason: "  ajustar ritmo  " }, now).reason)
    .toBe("ajustar ritmo");
  expect(() => createWorkoutChangeRequest({ ...input, reason: "   " }, now)).toThrow();
});

it("acknowledges without closing the request", () => {
  const acknowledged = transitionWorkoutChangeRequest(
    open, WorkoutChangeRequestStatus.ACKNOWLEDGED, "coach-user", later,
  );
  expect(acknowledged).toMatchObject({
    status: WorkoutChangeRequestStatus.ACKNOWLEDGED,
    resolvedBy: null,
    resolvedAt: null,
    updatedAt: later,
  });
});

it.each([
  WorkoutChangeRequestStatus.RESOLVED,
  WorkoutChangeRequestStatus.DECLINED,
  WorkoutChangeRequestStatus.CANCELLED,
])("records who closed the request and when for %s", (status) => {
  const closed = transitionWorkoutChangeRequest(open, status, "coach-user", later, "ajustado");
  expect(closed).toMatchObject({
    status,
    resolvedBy: "coach-user",
    resolvedAt: later,
    resolutionNote: "ajustado",
  });
});

it("moves from acknowledged to a terminal state", () => {
  const acknowledged = transitionWorkoutChangeRequest(
    open, WorkoutChangeRequestStatus.ACKNOWLEDGED, "coach-user", later,
  );
  expect(
    transitionWorkoutChangeRequest(acknowledged, WorkoutChangeRequestStatus.RESOLVED, "coach-user", later).status,
  ).toBe(WorkoutChangeRequestStatus.RESOLVED);
});

it.each([
  WorkoutChangeRequestStatus.RESOLVED,
  WorkoutChangeRequestStatus.DECLINED,
  WorkoutChangeRequestStatus.CANCELLED,
])("refuses to reopen or re-decide a %s request", (status) => {
  const closed = transitionWorkoutChangeRequest(open, status, "coach-user", later);
  expect(() => transitionWorkoutChangeRequest(
    closed, WorkoutChangeRequestStatus.RESOLVED, "other", later,
  )).toThrow("WORKOUT_CHANGE_REQUEST_NOT_OPEN");
});

it("refuses a transition back to pending", () => {
  expect(() => transitionWorkoutChangeRequest(
    open, WorkoutChangeRequestStatus.PENDING, "coach-user", later,
  )).toThrow("WORKOUT_CHANGE_REQUEST_INVALID_TRANSITION");
});

it("rejects an open request that carries a resolution", () => {
  expect(() => workoutChangeRequestSchema.parse({
    ...open, resolvedBy: "coach-user", resolvedAt: later,
  })).toThrow();
});

it("rejects a closed request with no resolver", () => {
  expect(() => workoutChangeRequestSchema.parse({
    ...open, status: WorkoutChangeRequestStatus.RESOLVED,
  })).toThrow();
});

it("rejects a resolution dated before creation", () => {
  expect(() => workoutChangeRequestSchema.parse({
    ...open,
    status: WorkoutChangeRequestStatus.RESOLVED,
    resolvedBy: "coach-user",
    resolvedAt: new Date("2026-09-15T12:00:00Z"),
    updatedAt: later,
  })).toThrow();
});

it("rejects an update dated before creation", () => {
  expect(() => workoutChangeRequestSchema.parse({
    ...open, updatedAt: new Date("2026-09-15T12:00:00Z"),
  })).toThrow();
});

it("rejects unknown fields", () => {
  expect(() => workoutChangeRequestSchema.parse({ ...open, priority: "HIGH" })).toThrow();
});
