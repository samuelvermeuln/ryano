import { expect, it, vi } from "vitest";
import { RejoinSchool } from "@/modules/school/application/rejoin-school";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const before = new Date("2026-08-01T12:00:00Z");
const endedAt = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  const rows: SchoolAthleteMembership[] = [];
  const db = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", status: "ACTIVE" }) as { id: string; status: string } | null) },
    schoolAthleteMembership: {
      findFirst: vi.fn(async ({ where }: { where: { schoolId: string; athleteId: string; status: string } }) => rows.find((row) => row.schoolId === where.schoolId && row.athleteId === where.athleteId && row.status === where.status) ?? null),
      create: vi.fn(async ({ data }: { data: SchoolAthleteMembership }) => { rows.push(data); return data; }),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const clock = vi.fn(() => now);
  return { db, rows, clock, useCase: new RejoinSchool(db as never, clock) };
}

function period(status: "ACTIVE" | "ENDED" | "REVOKED" | "REJECTED", schoolId = "school:opaque", athleteId = "user:opaque") {
  const pending = createSchoolAthleteMembership({ id: `old:${schoolId}:${athleteId}`, schoolId, athleteId, joinSource: "SCHOOL_INVITE" }, before);
  const active = status === "REJECTED" ? pending : transitionSchoolAthleteMembership(pending, "ACTIVE", before, "owner");
  return status === "ACTIVE" ? active : transitionSchoolAthleteMembership(active, status, endedAt, "owner");
}

it.each(["ENDED", "REVOKED", "REJECTED"] as const)("creates a separate pending period after %s without inheriting approval or overwriting history [T057]", async (status) => {
  const { db, rows, clock, useCase } = fixture();
  rows.push(period(status));
  const history = structuredClone(rows);
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result).toMatchObject({ athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH", status: "PENDING", startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now });
  expect(result.id).not.toBe(history[0].id);
  expect(rows).toEqual([...history, result]);
  expect(clock).toHaveBeenCalledTimes(1);
  expect(db.schoolAthleteMembership.create).toHaveBeenCalledTimes(1);
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.delete).not.toHaveBeenCalled();
});

it("refuses an active period for this actor and school without changing history [T057]", async () => {
  const { db, rows, useCase } = fixture();
  rows.push(period("ACTIVE"));
  const history = structuredClone(rows);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE", status: 409 });
  expect(rows).toEqual(history);
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it("scopes rejoining to the authenticated athlete and requested school [T057]", async () => {
  const { rows, useCase } = fixture();
  rows.push(period("ENDED"), period("ACTIVE", "other-school"), period("ACTIVE", "school:opaque", "other-user"));
  const history = structuredClone(rows);
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(rows).toEqual([...history, result]);
  expect(result).toMatchObject({ athleteId: "user:opaque", schoolId: "school:opaque", status: "PENDING" });
});

it.each([null, "", " ", " user", "user ", "x".repeat(257)])("rejects invalid actor %j before reading data [T057]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it.each(["", " ", " school", "school ", "x".repeat(257)])("rejects invalid school %j before reading data [T057]", async (schoolId) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("user:opaque", schoolId)).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it.each([
  [null, "SCHOOL_NOT_FOUND", 404],
  [{ id: "school:opaque", status: "INACTIVE" }, "SCHOOL_INACTIVE", 409],
] as const)("refuses missing or inactive schools %j [T057]", async (school, code, status) => {
  const { db, rows, useCase } = fixture();
  rows.push(period("ENDED"));
  db.school.findUnique.mockResolvedValue(school);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code, status });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});
