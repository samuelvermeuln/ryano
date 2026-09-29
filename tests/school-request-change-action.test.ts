import { beforeEach, expect, it, vi } from "vitest";

/**
 * The administration's request/withdraw actions are used from two screens: the
 * coach sheet (which knows the coach membership) and the athlete sheet (which
 * does not). What is under test is the boundary: `membershipId` is optional and
 * only ever drives cache refresh, and the athlete sheet is refreshed either way.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requestExecute: vi.fn(),
  decideExecute: vi.fn(),
  revalidatePath: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth-guards", () => ({ requireOnboardedSession: () => mocks.auth() }));
vi.mock("@/modules/school/application/request-workout-change", () => ({
  RequestWorkoutChange: class { execute = mocks.requestExecute; },
}));
vi.mock("@/modules/school/application/decide-workout-change", () => ({
  DecideWorkoutChange: class { execute = mocks.decideExecute; },
}));

import {
  cancelWorkoutChangeAction,
  requestWorkoutChangeAction,
} from "@/app/escola/[schoolId]/professores/actions";

const ATHLETE_SHEET_PATTERN = "/escola/[schoolId]/atletas/[athleteId]";

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const requestFields = { schoolId: "school", workoutAssignmentId: "assignment", reason: "  reduzir o volume  " };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.requestExecute.mockResolvedValue({ id: "request" });
  mocks.decideExecute.mockResolvedValue({ id: "request" });
});

it("opens a request from the athlete sheet, where no coach membership id exists", async () => {
  const state = await requestWorkoutChangeAction({}, formData(requestFields));

  expect(state).toEqual({ ok: true });
  expect(mocks.requestExecute).toHaveBeenCalledWith("owner", "school", {
    workoutAssignmentId: "assignment",
    reason: "reduzir o volume",
  });
});

it("still accepts the coach membership id sent by the coach sheet", async () => {
  const state = await requestWorkoutChangeAction({}, formData({ ...requestFields, membershipId: "coach-membership" }));

  expect(state).toEqual({ ok: true });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/escola/school/professores/coach-membership");
});

it("does not use the membership id for authorization or pass it to the use case", async () => {
  await requestWorkoutChangeAction({}, formData({ ...requestFields, membershipId: "coach-membership" }));

  const [, , input] = mocks.requestExecute.mock.calls[0];
  expect(input).not.toHaveProperty("membershipId");
});

it("refreshes the athlete sheet whichever screen opened the request", async () => {
  await requestWorkoutChangeAction({}, formData(requestFields));
  expect(mocks.revalidatePath).toHaveBeenCalledWith(ATHLETE_SHEET_PATTERN, "page");

  mocks.revalidatePath.mockClear();
  await requestWorkoutChangeAction({}, formData({ ...requestFields, membershipId: "coach-membership" }));
  expect(mocks.revalidatePath).toHaveBeenCalledWith(ATHLETE_SHEET_PATTERN, "page");
});

it("rejects a blank reason without calling the use case", async () => {
  const state = await requestWorkoutChangeAction({}, formData({ ...requestFields, reason: "   " }));

  expect(state.message).toBe("Descreva a alteração desejada.");
  expect(mocks.requestExecute).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("surfaces the use case's domain error and refreshes nothing", async () => {
  const { SchoolError } = await import("@/modules/school/domain/errors");
  mocks.requestExecute.mockRejectedValue(
    new SchoolError("WORKOUT_CHANGE_REQUEST_ALREADY_OPEN", "Já existe uma solicitação de alteração aberta para esta prescrição.", 409),
  );

  const state = await requestWorkoutChangeAction({}, formData(requestFields));

  expect(state).toEqual({ message: "Já existe uma solicitação de alteração aberta para esta prescrição." });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("withdraws a request from the athlete sheet and refreshes it", async () => {
  const state = await cancelWorkoutChangeAction({}, formData({ schoolId: "school", requestId: "request" }));

  expect(state).toEqual({ ok: true });
  expect(mocks.decideExecute).toHaveBeenCalledWith("owner", "school", "request", {
    status: "CANCELLED",
    resolutionNote: null,
  });
  expect(mocks.revalidatePath).toHaveBeenCalledWith(ATHLETE_SHEET_PATTERN, "page");
});

it("is unavailable while the school module is off", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";

  expect(await requestWorkoutChangeAction({}, formData(requestFields))).toEqual({ message: "Recurso indisponível." });
  expect(await cancelWorkoutChangeAction({}, formData({ schoolId: "school", requestId: "request" })))
    .toEqual({ message: "Recurso indisponível." });
  expect(mocks.auth).not.toHaveBeenCalled();
});
