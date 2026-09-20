import { describe, expect, it, vi } from "vitest";
import { DeclineWorkoutRequest } from "@/modules/school/application/decline-workout-request";

const now = new Date("2026-09-20T12:00:00Z");
const pendingRequest = { id: "req:opaque", athleteId: "athlete:opaque", schoolId: "school:opaque", sportType: "run", status: "PENDING" };

function fixture() {
  const tx = {
    coachProfile: { findUnique: vi.fn(async () => ({ id: "coach:opaque", status: "ACTIVE" })) },
    workoutRequest: {
      findUnique: vi.fn(async () => pendingRequest),
      update: vi.fn(async ({ data }: { data: object }) => ({ ...pendingRequest, ...data })),
    },
    coachSchoolMembership: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => ({ id: "membership:opaque" })) },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
  };
  const db = { $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  return { db, tx, useCase: new DeclineWorkoutRequest(db as never, () => now) };
}

describe("DeclineWorkoutRequest", () => {
  it("declines a pending request and audits it", async () => {
    const { tx, useCase } = fixture();
    const result = await useCase.execute("coach-user:opaque", { requestId: "req:opaque", declineReason: "Sem vaga na agenda" });

    expect(result).toMatchObject({ status: "DECLINED", decidedBy: "coach-user:opaque" });
    expect(tx.schoolAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "workout_request.declined" }),
    }));
  });

  it("rejects a request that was already decided", async () => {
    const { tx, useCase } = fixture();
    tx.workoutRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: "DECLINED" });
    await expect(useCase.execute("coach-user:opaque", { requestId: "req:opaque" }))
      .rejects.toMatchObject({ code: "WORKOUT_REQUEST_NOT_PENDING", status: 409 });
  });

  it("rejects a coach without an active membership in the request's school", async () => {
    const { tx, useCase } = fixture();
    tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("coach-user:opaque", { requestId: "req:opaque" }))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 403 });
  });
});
