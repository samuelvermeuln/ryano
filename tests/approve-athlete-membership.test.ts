import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ApproveAthleteMembership } from "@/modules/school/application/approve-athlete-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const startedAt = new Date("2026-09-09T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  let row: SchoolAthleteMembership | null = createSchoolAthleteMembership(
    { id: "period:opaque", athleteId: "athlete:opaque", joinSource: "MANUAL_SEARCH", schoolId: "school:opaque" }, startedAt,
  );
  const tx = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", ownerUserId: "owner:opaque", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    schoolMembership: { findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => where.userId === "owner:opaque" ? { id: "manager", userId: where.userId, schoolId: "school:opaque", status: "ACTIVE", endedAt: null } : null) },
    schoolMembershipRole: { findMany: vi.fn(async () => [{ membershipId: "manager", role: "OWNER" }]) },
    schoolAthleteMembership: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Partial<SchoolAthleteMembership> }) => {
        row = { ...row!, ...data };
        return row;
      }),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  const clock = vi.fn(() => now);
  // Only the transaction client exposes delegates, so any read outside the transaction fails.
  return { db, clock, useCase: new ApproveAthleteMembership({ $transaction: db.$transaction } as never, clock), setRow: (value: SchoolAthleteMembership | null) => { row = value; }, getRow: () => row! };
}

it("approves only the pending athlete period, preserving identity and prior timestamps [T054]", async () => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  const result = await useCase.execute("owner:opaque", "school:opaque", "period:opaque");
  expect(result).toEqual({ ...prior, status: "ACTIVE", approvedBy: "owner:opaque", approvedAt: now, startedAt: now, endedAt: null, updatedAt: now });
  expect(db.schoolAthleteMembership.update).toHaveBeenCalledExactlyOnceWith({
    where: { id: prior.id, status: "PENDING", updatedAt: startedAt },
    data: { status: "ACTIVE", approvedBy: "owner:opaque", approvedAt: now, startedAt: now, endedAt: null, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, updatedAt: now },
  });
  expect(clock).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

it("allows the local ADMIN role and does not require school ownership [T054]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue({ id: "school:opaque", ownerUserId: "someone-else", status: "ACTIVE" });
  db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role: "ADMIN" }]);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).resolves.toMatchObject({ status: "ACTIVE" });
});

it.each(["missing-membership", "ended-membership", "pending-membership", "coach-role", "foreign-role"])("denies %s even to the school owner [T054]", async (scenario) => {
  const { db, useCase } = fixture();
  if (scenario === "missing-membership") db.schoolMembership.findFirst.mockResolvedValue(null);
  if (scenario === "ended-membership" || scenario === "pending-membership") {
    db.schoolMembership.findFirst.mockResolvedValue({
      id: "manager", userId: "owner:opaque", schoolId: "school:opaque",
      status: scenario === "pending-membership" ? "PENDING" : "ACTIVE",
      endedAt: scenario === "ended-membership" ? now : null,
    } as never);
  }
  if (scenario === "coach-role") db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role: "COACH" }]);
  if (scenario === "foreign-role") db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "other", role: "OWNER" }]);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("refuses inactive schools without changing a pending period [T054]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue({ id: "school:opaque", ownerUserId: "owner:opaque", status: "INACTIVE" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_INACTIVE", status: 409 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it.each(["P2002", "P2025", "P2034"])("maps transaction conflict %s to a stable 409 [T054]", async (code) => {
  const { db, useCase } = fixture();
  db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conflict", { code, clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
});

it.each([null, "", " ", " owner", "owner ", "x".repeat(257)])("rejects invalid actor %j before database access [T054]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["", " ", " target", "target ", "x".repeat(257)])("rejects malformed identifiers %j without persistence [T054]", async (invalid) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", invalid, "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  await expect(useCase.execute("owner:opaque", "school:opaque", invalid)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("refuses actors without an active local management membership [T054]", async () => {
  const { db, useCase } = fixture();
  for (const actor of ["global-admin", "coach:opaque", "other-owner"]) {
    await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  }
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("returns school not found without touching memberships [T054]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
});

it.each(["absent", "other-school"])("hides %s membership and does not write [T054]", async (scenario) => {
  const { db, useCase, setRow, getRow } = fixture();
  setRow(scenario === "absent" ? null : { ...getRow(), schoolId: "other-school" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it.each(["ACTIVE", "REJECTED", "ENDED", "REVOKED"] as const)("does not approve a %s period [T054]", async (status) => {
  const { db, useCase, setRow, getRow } = fixture();
  const pending = createSchoolAthleteMembership({ id: "period:opaque", athleteId: "athlete:opaque", joinSource: "MANUAL_SEARCH", schoolId: "school:opaque" }, startedAt);
  setRow(status === "ACTIVE" || status === "REJECTED"
    ? transitionSchoolAthleteMembership(pending, status, startedAt)
    : transitionSchoolAthleteMembership(transitionSchoolAthleteMembership(pending, "ACTIVE", startedAt), status, startedAt));
  const prior = structuredClone(getRow());
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_INVALID_TRANSITION", status: 409 });
  expect(getRow()).toEqual(prior);
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("reports concurrent changes as a stable conflict [T054]", async () => {
  const { db, useCase } = fixture();
  db.schoolAthleteMembership.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
});

it("preserves unexpected persistence errors [T054]", async () => {
  const { db, useCase } = fixture();
  const error = new Error("storage unavailable");
  db.schoolAthleteMembership.update.mockRejectedValue(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});

it.each([new Date(startedAt.getTime() - 1), new Date(Number.NaN)])("rejects an invalid decision time %s without changing the period [T054]", async (invalidTime) => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  clock.mockReturnValue(invalidTime);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBeInstanceOf(ZodError);
  expect(getRow()).toEqual(prior);
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("returns not found when the period disappears before the transition read [T054]", async () => {
  const { db, useCase, getRow } = fixture();
  db.schoolAthleteMembership.findUnique.mockResolvedValueOnce(getRow()).mockResolvedValueOnce(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});
