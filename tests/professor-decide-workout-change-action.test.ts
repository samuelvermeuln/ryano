import { beforeEach, expect, it, vi } from "vitest";

/**
 * Coverage for the coach-facing server action that answers a workout change
 * request. The point under test is the boundary, not the domain: the action
 * must forward intent to `DecideWorkoutChange` (which owns authorization) and
 * must never let the coach reach the administration-only CANCELLED transition.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  school: vi.fn(),
  membershipFirst: vi.fn(),
  roles: vi.fn(),
  coachProfile: vi.fn(),
  requestFindUnique: vi.fn(),
  requestUpdate: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));
const { client } = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth-guards", () => ({
  requireOnboardedSession: () => mocks.auth(),
}));
vi.mock("@/server/db", () => {
  Object.assign(client, {
    school: { findUnique: mocks.school },
    schoolMembership: { findFirst: mocks.membershipFirst },
    schoolMembershipRole: { findMany: mocks.roles },
    coachProfile: { findUnique: mocks.coachProfile },
    workoutChangeRequest: {
      findUnique: mocks.requestFindUnique,
      update: mocks.requestUpdate,
    },
    // SAM-29 — the decision notifies whoever asked; the assignment tells athlete from administration.
    workoutAssignment: { findUnique: vi.fn().mockResolvedValue({ athleteId: "athlete" }) },
    auditLog: { create: mocks.audit },
  });
  return { prisma: { ...client, $transaction: mocks.transaction } };
});

import { decideWorkoutChangeAsCoachAction } from "@/app/professor/[schoolId]/actions";

const now = new Date("2026-09-16T12:00:00Z");
const openRequest = {
  id: "request", schoolId: "school", workoutAssignmentId: "assignment", coachId: "coach",
  requestedBy: "owner", reason: "ajustar ritmo", status: "PENDING",
  resolvedBy: null, resolvedAt: null, resolutionNote: null, createdAt: now, updatedAt: now,
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const validFields = { schoolId: "school", requestId: "request", status: "ACKNOWLEDGED" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  // The signed-in user is the coach the request is addressed to.
  mocks.auth.mockResolvedValue({ user: { id: "coach-user" } });
  mocks.school.mockResolvedValue({ id: "school", status: "ACTIVE" });
  mocks.coachProfile.mockResolvedValue({ userId: "coach-user" });
  mocks.requestFindUnique.mockResolvedValue(openRequest);
  mocks.requestUpdate.mockImplementation(({ data }: { data: unknown }) =>
    Promise.resolve({ ...openRequest, ...(data as object) }),
  );
  mocks.audit.mockResolvedValue({});
  mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(client));
});

it("lets the responsible coach acknowledge a pending request", async () => {
  const state = await decideWorkoutChangeAsCoachAction({}, formData(validFields));

  expect(state).toEqual({ ok: true });
  expect(mocks.requestUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ status: "ACKNOWLEDGED" }) }),
  );
});

it("forwards the resolution note when resolving", async () => {
  const state = await decideWorkoutChangeAsCoachAction(
    {},
    formData({ ...validFields, status: "RESOLVED", resolutionNote: "troquei o ritmo alvo" }),
  );

  expect(state).toEqual({ ok: true });
  expect(mocks.requestUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "RESOLVED", resolutionNote: "troquei o ritmo alvo" }),
    }),
  );
});

it("treats a blank note as absent instead of storing an empty string", async () => {
  await decideWorkoutChangeAsCoachAction(
    {},
    formData({ ...validFields, status: "DECLINED", resolutionNote: "   " }),
  );

  const [[call]] = mocks.requestUpdate.mock.calls;
  expect((call as { data: { resolutionNote?: string | null } }).data.resolutionNote).not.toBe("   ");
});

it("refuses CANCELLED — withdrawing is administration-only", async () => {
  const state = await decideWorkoutChangeAsCoachAction(
    {},
    formData({ ...validFields, status: "CANCELLED" }),
  );

  expect(state.ok).toBeUndefined();
  expect(state.message).toBeTruthy();
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("rejects a coach who is not the one responsible", async () => {
  mocks.coachProfile.mockResolvedValue({ userId: "another-coach-user" });

  const state = await decideWorkoutChangeAsCoachAction({}, formData(validFields));

  expect(state.message).toBe("Somente o professor responsável pode responder a esta solicitação.");
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("does not act when the request belongs to another school", async () => {
  mocks.requestFindUnique.mockResolvedValue({ ...openRequest, schoolId: "other-school" });

  const state = await decideWorkoutChangeAsCoachAction({}, formData(validFields));

  expect(state.message).toBeTruthy();
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("reports a closed request instead of reopening it", async () => {
  // A closed request carries its resolver and timestamp — the entity rejects a
  // RESOLVED row without them, so an incomplete fixture would fail for the
  // wrong reason.
  mocks.requestFindUnique.mockResolvedValue({
    ...openRequest,
    status: "RESOLVED",
    resolvedBy: "coach-user",
    resolvedAt: now,
  });

  const state = await decideWorkoutChangeAsCoachAction({}, formData(validFields));

  expect(state.message).toBe("Esta solicitação já foi encerrada.");
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("rejects missing fields without touching the database", async () => {
  const state = await decideWorkoutChangeAsCoachAction({}, formData({ schoolId: "school" }));

  expect(state.message).toBeTruthy();
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("is unavailable while the school module is off", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";

  const state = await decideWorkoutChangeAsCoachAction({}, formData(validFields));

  expect(state).toEqual({ message: "Recurso indisponível." });
  expect(mocks.auth).not.toHaveBeenCalled();
});

it("revalidates the coach screens that show the request", async () => {
  await decideWorkoutChangeAsCoachAction({}, formData(validFields));

  expect(mocks.revalidatePath).toHaveBeenCalledWith("/professor/school");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/professor/school/treinos");
});
