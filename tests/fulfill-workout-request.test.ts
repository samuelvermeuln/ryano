import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { FulfillWorkoutRequest } from "@/modules/school/application/fulfill-workout-request";

// Real Prisma reads a JsonNull/DbNull column back as plain `null` — replicate that
// translation here since the fixture below returns the create() payload as-is.
function normalizeJsonNulls<T extends Record<string, unknown>>(data: T): T {
  const normalized = { ...data };
  for (const key of Object.keys(normalized)) {
    if (normalized[key] === Prisma.JsonNull || normalized[key] === Prisma.DbNull) {
      (normalized as Record<string, unknown>)[key] = null;
    }
  }
  return normalized;
}

const now = new Date("2026-09-20T12:00:00Z");
const pendingRequest = { id: "req:opaque", athleteId: "athlete:opaque", schoolId: "school:opaque", sportType: "run", status: "PENDING" };

function fixture() {
  const tx = {
    coachProfile: { findUnique: vi.fn(async (): Promise<{ id: string; status: string } | null> => ({ id: "coach:opaque", status: "ACTIVE" })) },
    workoutRequest: {
      findUnique: vi.fn(async (): Promise<typeof pendingRequest | null> => pendingRequest),
      update: vi.fn(async ({ data }: { data: object }) => ({ ...pendingRequest, ...data })),
    },
    coachSchoolMembership: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => ({ id: "membership:opaque" })) },
    workout: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    workoutBlock: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => normalizeJsonNulls(data)) },
    workoutAssignment: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    workoutAssignmentHistory: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
  };
  const db = { $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  return { db, tx, useCase: new FulfillWorkoutRequest(db as never, () => now) };
}

describe("FulfillWorkoutRequest", () => {
  it("approves a pending request: creates workout + assignment, closes the request, audits it", async () => {
    const { tx, useCase } = fixture();
    const result = await useCase.execute("coach-user:opaque", {
      requestId: "req:opaque", title: "Treino de corrida", scheduledAt: now, durationSeconds: 1800,
    });

    expect(result.request).toMatchObject({ status: "APPROVED", decidedBy: "coach-user:opaque" });
    expect(tx.workoutBlock.create).toHaveBeenCalledOnce();
    expect(tx.workoutAssignment.create).toHaveBeenCalledOnce();
    expect(tx.schoolAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "workout_request.approved" }),
    }));
  });

  it("does not create a WorkoutBlock when no duration/distance is given", async () => {
    const { tx, useCase } = fixture();
    await useCase.execute("coach-user:opaque", { requestId: "req:opaque", title: "Treino livre", scheduledAt: now });
    expect(tx.workoutBlock.create).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated actor", async () => {
    const { db, useCase } = fixture();
    await expect(useCase.execute(null, { requestId: "req:opaque", title: "X", scheduledAt: now }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a coach without an active CoachProfile", async () => {
    const { tx, useCase } = fixture();
    tx.coachProfile.findUnique.mockResolvedValue(null);
    await expect(useCase.execute("coach-user:opaque", { requestId: "req:opaque", title: "X", scheduledAt: now }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
  });

  it("rejects a coach without an active membership in the request's school", async () => {
    const { tx, useCase } = fixture();
    tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("coach-user:opaque", { requestId: "req:opaque", title: "X", scheduledAt: now }))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 403 });
  });

  it("rejects a request that was already decided", async () => {
    const { tx, useCase } = fixture();
    tx.workoutRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: "APPROVED" });
    await expect(useCase.execute("coach-user:opaque", { requestId: "req:opaque", title: "X", scheduledAt: now }))
      .rejects.toMatchObject({ code: "WORKOUT_REQUEST_NOT_PENDING", status: 409 });
    expect(tx.workoutAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown request id", async () => {
    const { tx, useCase } = fixture();
    tx.workoutRequest.findUnique.mockResolvedValue(null);
    await expect(useCase.execute("coach-user:opaque", { requestId: "missing", title: "X", scheduledAt: now }))
      .rejects.toMatchObject({ code: "WORKOUT_REQUEST_NOT_FOUND", status: 404 });
  });
});
