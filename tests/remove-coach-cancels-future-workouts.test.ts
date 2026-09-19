import { describe, expect, it, vi } from "vitest";
import { RemoveCoachFromSchool } from "@/modules/school/application/remove-coach-from-school";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";
import { createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const startedAt = new Date("2026-10-01T08:00:00Z");
const now = new Date("2026-10-10T08:00:00Z");

function fixture(futureAssignments: Array<{ id: string }> = []) {
  const membership = transitionCoachSchoolMembership(
    createCoachSchoolMembership({ id: "period-1", coachId: "coach-1", schoolId: "school-1" }, startedAt),
    "ACTIVE",
    startedAt,
  );

  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    school: { findUnique: vi.fn(async () => ({ id: "school-1", ownerUserId: "owner-1", status: "ACTIVE" })) },
    coachSchoolMembership: {
      findUnique: vi.fn(async () => membership),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...membership, ...data })),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    workoutAssignment: {
      findMany: vi.fn(async () => futureAssignments),
      updateMany: vi.fn(async () => ({ count: futureAssignments.length })),
    },
    workoutAssignmentHistory: {
      createMany: vi.fn(async () => ({ count: futureAssignments.length })),
    },
  };

  return { db, useCase: new RemoveCoachFromSchool(db as never, () => now) };
}

describe("RemoveCoachFromSchool — T145: cancel future workout assignments", () => {
  it("does not touch workoutAssignment when there are no future assignments", async () => {
    const { db, useCase } = fixture([]);
    await useCase.execute("owner-1", "school-1", "period-1");
    expect(db.workoutAssignment.findMany).toHaveBeenCalledOnce();
    expect(db.workoutAssignment.updateMany).not.toHaveBeenCalled();
    expect(db.workoutAssignmentHistory.createMany).not.toHaveBeenCalled();
  });

  it("cancels all future assignments belonging to the coach in the removed school", async () => {
    const future = [{ id: "wa-1" }, { id: "wa-2" }];
    const { db, useCase } = fixture(future);
    await useCase.execute("owner-1", "school-1", "period-1");

    expect(db.workoutAssignment.findMany).toHaveBeenCalledWith({
      where: {
        coachId: "coach-1",
        schoolId: "school-1",
        status: { in: expect.arrayContaining([WorkoutAssignmentStatus.SCHEDULED, WorkoutAssignmentStatus.AVAILABLE, WorkoutAssignmentStatus.RESCHEDULED]) },
        scheduledAt: { gte: now },
      },
      select: { id: true },
    });

    expect(db.workoutAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["wa-1", "wa-2"] } },
      data: { status: WorkoutAssignmentStatus.CANCELLED, updatedAt: now },
    });
  });

  it("records audit history for each cancelled assignment", async () => {
    const future = [{ id: "wa-1" }, { id: "wa-2" }];
    const { db, useCase } = fixture(future);
    await useCase.execute("owner-1", "school-1", "period-1");

    const historyCall = (db.workoutAssignmentHistory.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(historyCall.data).toHaveLength(2);
    for (const record of historyCall.data) {
      expect(record.eventType).toBe("CANCELLED");
      expect(record.actorUserId).toBe("owner-1");
      expect(record.payload).toMatchObject({ reason: "coach_removed", schoolId: "school-1" });
    }
  });
});
