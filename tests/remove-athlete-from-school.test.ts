import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { RemoveAthleteFromSchool } from "@/modules/school/application/remove-athlete-from-school";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const startedAt = new Date("2026-09-09T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  const pending = createSchoolAthleteMembership({ id: "period:opaque", athleteId: "athlete:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, startedAt);
  let row: SchoolAthleteMembership | null = transitionSchoolAthleteMembership(pending, "ACTIVE", startedAt, "approver:opaque");
  const db = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", ownerUserId: "owner:opaque" }) as { id: string; ownerUserId: string } | null) },
    schoolAthleteMembership: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Partial<SchoolAthleteMembership> }) => (row = { ...row!, ...data })),
    },
  };
  return { db, pending, useCase: new RemoveAthleteFromSchool(db as never, () => now), getRow: () => row!, setRow: (value: SchoolAthleteMembership | null) => { row = value; } };
}

it("ends the active period preserving identity, approval and historical timestamps [T056]", async () => {
  const { db, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  await expect(useCase.execute("owner:opaque", "school:opaque", prior.id)).resolves.toEqual({ ...prior, status: "ENDED", endedAt: now, updatedAt: now });
  expect(db.schoolAthleteMembership.update).toHaveBeenCalledExactlyOnceWith({
    where: { id: prior.id, status: "ACTIVE", updatedAt: startedAt },
    data: { status: "ENDED", startedAt, endedAt: now, approvedBy: prior.approvedBy, approvedAt: prior.approvedAt, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, updatedAt: now },
  });
});

it.each([null, "", " ", " owner", "owner ", "x".repeat(257)])("rejects invalid actor %j before reading data [T056]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["", " ", " target", "target ", "x".repeat(257)])("rejects malformed target %j [T056]", async (invalid) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", invalid, "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  await expect(useCase.execute("owner:opaque", "school:opaque", invalid)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["global-admin", "athlete:opaque", "other-owner"])("refuses non-owner %s without exposing memberships [T056]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
});

it("handles an absent school [T056]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
});

it.each(["absent", "other-school", "disappeared"])("hides %s period without writing [T056]", async (scenario) => {
  const { db, useCase, setRow, getRow } = fixture();
  if (scenario === "disappeared") db.schoolAthleteMembership.findUnique.mockResolvedValueOnce(getRow()).mockResolvedValueOnce(null);
  else setRow(scenario === "absent" ? null : { ...getRow(), schoolId: "other-school" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it.each(["PENDING", "REJECTED", "ENDED", "REVOKED"] as const)("preserves a %s period [T056]", async (status) => {
  const { db, pending, useCase, setRow, getRow } = fixture();
  setRow(status === "PENDING" ? pending : transitionSchoolAthleteMembership(status === "REJECTED" ? pending : getRow(), status, startedAt, "owner:opaque"));
  const prior = structuredClone(getRow());
  await expect(useCase.execute("owner:opaque", "school:opaque", prior.id)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_INVALID_TRANSITION", status: 409 });
  expect(getRow()).toEqual(prior);
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("translates concurrent changes and preserves other storage errors [T056]", async () => {
  const { db, useCase } = fixture();
  db.schoolAthleteMembership.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
  const error = new Error("storage unavailable");
  db.schoolAthleteMembership.update.mockRejectedValueOnce(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});
