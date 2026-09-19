import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { SchoolService } from "@/modules/school/application/school-service";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";

const now = new Date("2026-10-10T08:00:00Z");

function setup(futureAssignments: Array<{ id: string }> = []) {
  const school = { id: "school-1", ownerUserId: "owner-1", status: "ACTIVE", updatedAt: new Date("2026-10-01") };
  const tx = {
    school: {
      findUnique: vi.fn().mockResolvedValue(school),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...school, status: "INACTIVE", deactivatedAt: now }),
    },
    schoolMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: "m-1", schoolId: "school-1", userId: "owner-1", status: "ACTIVE", endedAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "m-1", role: "OWNER" }]) },
    schoolAthleteMembership: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    coachSchoolMembership: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    coachAthleteAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    workoutAssignment: {
      findMany: vi.fn().mockResolvedValue(futureAssignments),
      updateMany: vi.fn().mockResolvedValue({ count: futureAssignments.length }),
    },
    workoutAssignmentHistory: { createMany: vi.fn().mockResolvedValue({ count: futureAssignments.length }) },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    school: { findUnique: vi.fn().mockResolvedValue(school), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ ...school, deactivatedAt: null }) },
    $transaction: vi.fn().mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => run(tx)),
  };
  return { db, tx, service: new SchoolService(db as unknown as PrismaClient, () => now) };
}

describe("DeactivateSchool — T146: cancel future workout assignments", () => {
  it("does not touch workoutAssignment when there are no future assignments", async () => {
    const { service, tx } = setup([]);
    await service.deactivate("owner-1", "school-1");
    expect(tx.workoutAssignment.findMany).toHaveBeenCalledOnce();
    expect(tx.workoutAssignment.updateMany).not.toHaveBeenCalled();
    expect(tx.workoutAssignmentHistory.createMany).not.toHaveBeenCalled();
  });

  it("queries future assignments with correct scope and statuses", async () => {
    const { service, tx } = setup([]);
    await service.deactivate("owner-1", "school-1");
    expect(tx.workoutAssignment.findMany).toHaveBeenCalledWith({
      where: {
        schoolId: "school-1",
        status: { in: expect.arrayContaining([WorkoutAssignmentStatus.SCHEDULED, WorkoutAssignmentStatus.AVAILABLE, WorkoutAssignmentStatus.RESCHEDULED]) },
        scheduledAt: { gte: now },
      },
      select: { id: true },
    });
  });

  it("cancels all future assignments and records audit history", async () => {
    const { service, tx } = setup([{ id: "wa-1" }, { id: "wa-2" }]);
    await service.deactivate("owner-1", "school-1");

    expect(tx.workoutAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["wa-1", "wa-2"] } },
      data: { status: WorkoutAssignmentStatus.CANCELLED, updatedAt: now },
    });

    const historyCall = (tx.workoutAssignmentHistory.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(historyCall.data).toHaveLength(2);
    for (const record of historyCall.data) {
      expect(record.eventType).toBe("CANCELLED");
      expect(record.actorUserId).toBe("owner-1");
      expect(record.payload).toMatchObject({ reason: "school_deactivated", schoolId: "school-1" });
    }
  });

  it("includes futureWorkoutsCancelled in the audit log metadata", async () => {
    const { service, tx } = setup([{ id: "wa-1" }]);
    await service.deactivate("owner-1", "school-1");
    const auditCall = (tx.adminAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditCall.data.metadata.futureWorkoutsCancelled).toBe(1);
  });
});
