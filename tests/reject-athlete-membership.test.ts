import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { RejectAthleteMembership } from "@/modules/school/application/reject-athlete-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const createdAt = new Date("2026-09-09T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  let row: SchoolAthleteMembership | null = createSchoolAthleteMembership({ id: "period:opaque", athleteId: "athlete:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, createdAt);
  const db = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", ownerUserId: "owner:opaque" }) as { id: string; ownerUserId: string } | null) },
    schoolAthleteMembership: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Partial<SchoolAthleteMembership> }) => { row = { ...row!, ...data }; return row; }),
    },
  };
  const clock = vi.fn(() => now);
  return { db, clock, useCase: new RejectAthleteMembership(db as never, clock), getRow: () => row!, setRow: (value: SchoolAthleteMembership | null) => { row = value; } };
}

it("rejects a pending athlete with actor audit, preserving identity and guarding concurrency [T055]", async () => {
  const { db, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  expect(await useCase.execute("owner:opaque", "school:opaque", "period:opaque")).toEqual({ ...prior, status: "REJECTED", rejectedBy: "owner:opaque", rejectedAt: now, endedAt: now, updatedAt: now });
  expect(db.schoolAthleteMembership.update).toHaveBeenCalledExactlyOnceWith({
    where: { id: prior.id, status: "PENDING", updatedAt: createdAt },
    data: { status: "REJECTED", startedAt: null, endedAt: now, approvedBy: null, approvedAt: null, rejectedBy: "owner:opaque", rejectedAt: now, revokedBy: null, revokedAt: null, updatedAt: now },
  });
});

it.each([null, "", " ", " owner", "owner ", "x".repeat(257)])("denies invalid actor %j before database access [T055]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["", " ", " target", "target ", "x".repeat(257)])("denies invalid target %j [T055]", async (invalid) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", invalid, "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  await expect(useCase.execute("owner:opaque", "school:opaque", invalid)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["global-admin", "athlete:opaque", "other-owner"])("denies non-owner %s before reading athlete membership [T055]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
});

it("handles missing schools [T055]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
});

it.each(["absent", "other-school"])("hides %s membership [T055]", async (scenario) => {
  const { db, useCase, setRow, getRow } = fixture();
  setRow(scenario === "absent" ? null : { ...getRow(), schoolId: "other-school" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it.each(["ACTIVE", "REJECTED", "ENDED", "REVOKED"] as const)("preserves %s periods [T055]", async (status) => {
  const { db, useCase, setRow, getRow } = fixture();
  const pending = getRow();
  setRow(status === "ACTIVE" || status === "REJECTED" ? transitionSchoolAthleteMembership(pending, status, createdAt, "owner:opaque") : transitionSchoolAthleteMembership(transitionSchoolAthleteMembership(pending, "ACTIVE", createdAt, "owner:opaque"), status, createdAt));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_INVALID_TRANSITION", status: 409 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("maps concurrent updates to conflict and preserves unexpected errors [T055]", async () => {
  const { db, useCase } = fixture();
  db.schoolAthleteMembership.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
  const error = new Error("storage unavailable");
  db.schoolAthleteMembership.update.mockRejectedValueOnce(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});

it.each([new Date(createdAt.getTime() - 1), new Date(Number.NaN)])("does not persist invalid clock %s [T055]", async (invalid) => {
  const { db, clock, useCase } = fixture();
  clock.mockReturnValue(invalid);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toThrow();
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("handles disappearance before the transition read [T055]", async () => {
  const { db, useCase, getRow } = fixture();
  db.schoolAthleteMembership.findUnique.mockResolvedValueOnce(getRow()).mockResolvedValueOnce(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});
