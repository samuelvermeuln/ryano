import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { LogUnplannedWorkout } from "@/modules/school/application/log-unplanned-workout";

const now = new Date("2026-09-20T12:00:00Z");

function fixture() {
  const tx = {
    workout: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    workoutAssignment: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    workoutExecution: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    workoutAssignmentHistory: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
  };
  const db = { $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  const clock = vi.fn(() => now);
  return { db, tx, clock, useCase: new LogUnplannedWorkout(db as never, clock) };
}

describe("LogUnplannedWorkout", () => {
  it("logs a self-reported activity as a CONFIRMED execution on an UNPLANNED assignment", async () => {
    const { tx, useCase } = fixture();
    const result = await useCase.execute("athlete:opaque", {
      sportType: "run",
      scheduledAt: new Date("2026-09-19T12:00:00Z"),
      durationSeconds: 1800,
      distanceMeters: 5000,
      note: "Corrida leve",
    });

    expect(result.assignment).toMatchObject({
      athleteId: "athlete:opaque", assignedBy: "athlete:opaque", schoolId: null, coachId: null, status: "UNPLANNED",
    });
    expect(result.execution).toMatchObject({ matchStatus: "CONFIRMED", matchScore: 100, source: "self-report" });
    expect(tx.workoutAssignmentHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "SELF_LOGGED", actorUserId: "athlete:opaque" }),
    }));
  });

  it("rejects an unauthenticated actor before touching the database", async () => {
    const { db, useCase } = fixture();
    await expect(useCase.execute(null, { sportType: "run", scheduledAt: new Date(), durationSeconds: 60 }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a scheduledAt in the future", async () => {
    const { db, useCase } = fixture();
    await expect(useCase.execute("athlete:opaque", { sportType: "run", scheduledAt: new Date("2026-09-21T12:00:00Z"), durationSeconds: 60 }))
      .rejects.toMatchObject({ code: "WORKOUT_LOG_INVALID_DATE", status: 422 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects input with neither duration nor distance", async () => {
    const { useCase } = fixture();
    await expect(useCase.execute("athlete:opaque", { sportType: "run", scheduledAt: new Date("2026-09-19T12:00:00Z") }))
      .rejects.toThrow();
  });

  it("maps a persistence conflict to WORKOUT_LOG_CONFLICT", async () => {
    const { db, useCase } = fixture();
    db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2002", clientVersion: "6" }));
    await expect(useCase.execute("athlete:opaque", { sportType: "run", scheduledAt: new Date("2026-09-19T12:00:00Z"), durationSeconds: 60 }))
      .rejects.toMatchObject({ code: "WORKOUT_LOG_CONFLICT", status: 409 });
  });
});
