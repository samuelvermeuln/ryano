import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { RemoveCoachFromSchool } from "@/modules/school/application/remove-coach-from-school";
import { createCoachSchoolMembership, transitionCoachSchoolMembership, type CoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const startedAt = new Date("2026-09-09T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  let row: CoachSchoolMembership | null = transitionCoachSchoolMembership(
    createCoachSchoolMembership({ id: "period:opaque", coachId: "coach:opaque", schoolId: "school:opaque" }, startedAt),
    "ACTIVE", startedAt,
  );
  const db = {
    $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(db)),
    coachAthleteAssignment: { findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 2 })) },
    workoutAssignment: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
    workoutAssignmentHistory: { createMany: vi.fn(async () => ({ count: 0 })) },
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", ownerUserId: "owner:opaque", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    coachSchoolMembership: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Partial<CoachSchoolMembership> }) => {
        row = { ...row!, ...data };
        return row;
      }),
    },
  };
  const clock = vi.fn(() => now);
  return { db, clock, useCase: new RemoveCoachFromSchool(db as never, clock), setRow: (value: CoachSchoolMembership | null) => { row = value; }, getRow: () => row! };
}

it("ends only the active coach period, preserving identity and prior timestamps [T052]", async () => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  const result = await useCase.execute("owner:opaque", "school:opaque", "period:opaque");
  expect(result).toEqual({ ...prior, status: "ENDED", endedAt: now, updatedAt: now });
  expect(db.coachSchoolMembership.update).toHaveBeenCalledExactlyOnceWith({
    where: { id: prior.id, status: "ACTIVE", updatedAt: startedAt },
    data: { status: "ENDED", decidedAt: startedAt, startedAt, endedAt: now, updatedAt: now },
  });
  expect(clock).toHaveBeenCalledTimes(1);
  expect(db.coachAthleteAssignment.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { coachId: prior.coachId, schoolId: prior.schoolId, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: now, endedBy: "owner:opaque", updatedAt: now },
  });
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

it.each([null, "", " ", " owner", "owner ", "x".repeat(257)])("rejects invalid actor %j before database access [T052]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["", " ", " target", "target ", "x".repeat(257)])("rejects malformed identifiers %j without persistence [T052]", async (invalid) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", invalid, "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  await expect(useCase.execute("owner:opaque", "school:opaque", invalid)).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("refuses a non-owner including global ADMIN and the coach themself [T052]", async () => {
  const { db, useCase } = fixture();
  for (const actor of ["global-admin", "coach:opaque", "other-owner"]) {
    await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  }
  expect(db.coachSchoolMembership.findUnique).not.toHaveBeenCalled();
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("returns school not found without touching memberships [T052]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.findUnique).not.toHaveBeenCalled();
});

it.each(["absent", "other-school"])("hides %s membership and does not write [T052]", async (scenario) => {
  const { db, useCase, setRow, getRow } = fixture();
  setRow(scenario === "absent" ? null : { ...getRow(), schoolId: "other-school" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it.each(["PENDING", "REJECTED", "ENDED", "REVOKED"] as const)("does not remove a %s period [T052]", async (status) => {
  const { db, useCase, setRow, getRow } = fixture();
  const pending = createCoachSchoolMembership({ id: "period:opaque", coachId: "coach:opaque", schoolId: "school:opaque" }, startedAt);
  setRow(status === "PENDING" ? pending : status === "REJECTED"
    ? transitionCoachSchoolMembership(pending, status, startedAt)
    : transitionCoachSchoolMembership(getRow(), status, startedAt));
  const prior = structuredClone(getRow());
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION", status: 409 });
  expect(getRow()).toEqual(prior);
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("reports concurrent changes as a stable conflict [T052]", async () => {
  const { db, useCase } = fixture();
  db.coachSchoolMembership.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_CONFLICT", status: 409 });
});

it("preserves unexpected persistence errors [T052]", async () => {
  const { db, useCase } = fixture();
  const error = new Error("storage unavailable");
  db.coachSchoolMembership.update.mockRejectedValue(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});

it.each([new Date(startedAt.getTime() - 1), new Date(Number.NaN)])("rejects an invalid end time %s without changing the period [T052]", async (invalidTime) => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  clock.mockReturnValue(invalidTime);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBeInstanceOf(ZodError);
  expect(getRow()).toEqual(prior);
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("returns not found when the period disappears before the transition read [T052]", async () => {
  const { db, useCase, getRow } = fixture();
  db.coachSchoolMembership.findUnique.mockResolvedValueOnce(getRow()).mockResolvedValueOnce(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("reports a serialization failure while closing assignments as a stable conflict [T069]", async () => {
  const { db, useCase } = fixture();
  db.coachAthleteAssignment.updateMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Concurrent assignment", { code: "P2034", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({
    code: "COACH_SCHOOL_MEMBERSHIP_CONFLICT", status: 409,
  });
});

it("propagates assignment storage failure instead of reporting a successful removal [T069]", async () => {
  const { db, useCase } = fixture();
  const error = new Error("assignment storage unavailable");
  db.coachAthleteAssignment.updateMany.mockRejectedValue(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});
