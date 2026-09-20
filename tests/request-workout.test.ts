import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { RequestWorkout } from "@/modules/school/application/request-workout";

function fixture() {
  const tx = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", status: "ACTIVE" })) },
    schoolAthleteMembership: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => ({ id: "membership:opaque" })) },
    workoutRequest: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
  };
  const db = { $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  return { db, tx, useCase: new RequestWorkout(db as never, () => new Date("2026-09-20T12:00:00Z")) };
}

describe("RequestWorkout", () => {
  it("creates a PENDING request when the athlete is an active member and audits it", async () => {
    const { tx, useCase } = fixture();
    const result = await useCase.execute("athlete:opaque", { schoolId: "school:opaque", sportType: "run" });

    expect(result).toMatchObject({ status: "PENDING", athleteId: "athlete:opaque", schoolId: "school:opaque" });
    expect(tx.schoolAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "workout_request.requested" }),
    }));
  });

  it("rejects an athlete without an active membership in the school", async () => {
    const { tx, useCase } = fixture();
    tx.schoolAthleteMembership.findFirst.mockResolvedValue(null);
    await expect(useCase.execute("athlete:opaque", { schoolId: "school:opaque", sportType: "run" }))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_MEMBER", status: 403 });
    expect(tx.workoutRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated actor before touching the database", async () => {
    const { db, useCase } = fixture();
    await expect(useCase.execute(null, { schoolId: "school:opaque", sportType: "run" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("maps a persistence conflict to WORKOUT_REQUEST_CREATE_CONFLICT", async () => {
    const { db, useCase } = fixture();
    db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2002", clientVersion: "6" }));
    await expect(useCase.execute("athlete:opaque", { schoolId: "school:opaque", sportType: "run" }))
      .rejects.toMatchObject({ code: "WORKOUT_REQUEST_CREATE_CONFLICT", status: 409 });
  });
});
