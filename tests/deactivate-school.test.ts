import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { SchoolService } from "@/modules/school/application/school-service";

const now = new Date("2026-09-14T12:00:00Z");

function setup() {
  const school = { id: "school", ownerUserId: "owner", status: "ACTIVE", updatedAt: new Date("2026-09-01") };
  const tx = {
    school: {
      findUnique: vi.fn().mockResolvedValue(school),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...school, status: "INACTIVE", deactivatedAt: now }),
    },
    schoolMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: "membership", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "membership", role: "OWNER" }]) },
    schoolAthleteMembership: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    coachSchoolMembership: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
    coachAthleteAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 5 }) },
    // T146: workout assignment cancellation on school deactivation
    workoutAssignment: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    workoutAssignmentHistory: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    school: {
      findUnique: vi.fn().mockResolvedValue(school),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...school, deactivatedAt: null }),
    },
    $transaction: vi.fn().mockImplementation(async (run) => run(tx)),
  };
  return { school, tx, db, service: new SchoolService(db as unknown as PrismaClient, () => now) };
}

describe("DeactivateSchool [T079]", () => {
  it("ends only active periods in this school, retaining historical fields and recording the actor", async () => {
    const { service, db, tx } = setup();
    await expect(service.deactivate("owner", "school")).resolves.toMatchObject({ status: "INACTIVE" });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    const ended = { status: "ENDED", endedAt: now, updatedAt: now };
    for (const repository of [tx.schoolMembership, tx.schoolAthleteMembership, tx.coachSchoolMembership]) {
      expect(repository.updateMany).toHaveBeenCalledWith({ where: { schoolId: "school", status: "ACTIVE" }, data: ended });
    }
    expect(tx.coachAthleteAssignment.updateMany).toHaveBeenCalledWith({
      where: { schoolId: "school", status: "ACTIVE" }, data: { ...ended, endedBy: "owner" },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({ data: {
      actorUserId: "owner", action: "SCHOOL_DEACTIVATED", entityType: "School", entityId: "school", createdAt: now,
      metadata: { membershipsEnded: 2, athleteMembershipsEnded: 3, coachMembershipsEnded: 4, assignmentsEnded: 5, futureWorkoutsCancelled: 0 },
    } });
  });

  it("denies an ADMIN without changing any period", async () => {
    const { service, tx } = setup();
    tx.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "membership", role: "ADMIN" }]);
    await expect(service.deactivate("owner", "school")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.schoolMembership.updateMany).not.toHaveBeenCalled();
    expect(tx.school.updateMany).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("rechecks school state inside the transaction before authorization after a concurrent deactivation", async () => {
    const { service, tx, school } = setup();
    tx.school.findUnique.mockResolvedValue({ ...school, status: "INACTIVE", deactivatedAt: now } as typeof school);
    tx.schoolMembership.findFirst.mockResolvedValue(null);
    await expect(service.deactivate("owner", "school")).resolves.toMatchObject({ status: "INACTIVE" });
    expect(tx.schoolMembership.updateMany).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("preserves inactive retries without opening a transaction", async () => {
    const { service, db, school } = setup();
    db.school.findUnique.mockResolvedValue({ ...school, status: "INACTIVE", deactivatedAt: now });
    await expect(service.deactivate("owner", "school")).resolves.toMatchObject({ deactivatedAt: now });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an outsider retry after a concurrent deactivation", async () => {
    const { service, tx, school } = setup();
    tx.school.findUnique.mockResolvedValue({ ...school, status: "INACTIVE" });
    await expect(service.deactivate("outsider", "school")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.schoolMembership.updateMany).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("reports a school removed before the transaction without ending any period", async () => {
    const { service, tx } = setup();
    tx.school.findUnique.mockResolvedValue(null);
    await expect(service.deactivate("owner", "school")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
    expect(tx.schoolMembership.updateMany).not.toHaveBeenCalled();
  });

  it.each(["", " ", " padded ", "x".repeat(257)])("rejects malformed IDs before any transaction: %s", async (invalidId) => {
    const { service, db } = setup();
    await expect(service.deactivate(invalidId, "school")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    await expect(service.deactivate("owner", invalidId)).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("allows the proprietor to reactivate without reopening ended periods", async () => {
    const { service, db, tx, school } = setup();
    db.school.findUnique.mockResolvedValue({ ...school, status: "INACTIVE", deactivatedAt: now });
    tx.schoolMembership.findFirst.mockResolvedValue(null);
    await expect(service.reactivate("owner", "school")).resolves.toMatchObject({ status: "ACTIVE", deactivatedAt: null });
    expect(db.school.updateMany).toHaveBeenCalledWith({
      where: { id: "school", status: "INACTIVE" },
      data: { status: "ACTIVE", deactivatedAt: null, updatedAt: now },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    for (const repository of [tx.schoolMembership, tx.schoolAthleteMembership, tx.coachSchoolMembership, tx.coachAthleteAssignment]) {
      expect(repository.updateMany).not.toHaveBeenCalled();
    }
  });

  it("aborts the compound operation if ending a relationship fails", async () => {
    const { service, tx } = setup();
    const failure = new Error("assignment write failed");
    tx.coachAthleteAssignment.updateMany.mockRejectedValue(failure);
    await expect(service.deactivate("owner", "school")).rejects.toBe(failure);
    expect(tx.school.updateMany).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("propagates an audit failure through the same transaction so the database rolls back the cascade", async () => {
    const { service, tx } = setup();
    const failure = new Error("audit unavailable");
    tx.adminAuditLog.create.mockRejectedValue(failure);
    await expect(service.deactivate("owner", "school")).rejects.toBe(failure);
  });

  it.each([["P2034", "SCHOOL_CONFLICT", 409], ["P2025", "SCHOOL_NOT_FOUND", 404]])(
    "maps asynchronous transaction failure %s", async (code, expectedCode, status) => {
      const { service, db } = setup();
      db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("transaction failed", { code, clientVersion: "test" }));
      await expect(service.deactivate("owner", "school")).rejects.toMatchObject({ code: expectedCode, status });
    },
  );
});
