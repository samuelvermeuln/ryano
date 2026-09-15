import { expect, it, vi } from "vitest";
import { RequestSchoolMembership } from "@/modules/school/application/request-school-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  const rows: SchoolAthleteMembership[] = [];
  const db = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", status: "ACTIVE" }) as { id: string; status: string } | null) },
    schoolAthleteMembership: {
      findFirst: vi.fn(async () => rows.find((row) => row.status === "ACTIVE") ?? null),
      create: vi.fn(async ({ data }: { data: SchoolAthleteMembership }) => { rows.push(data); return data; }),
    },
  };
  const clock = vi.fn(() => now);
  return { db, rows, clock, useCase: new RequestSchoolMembership(db as never, clock) };
}

it.each([null, "", " ", " user", "user ", "x".repeat(257)])("rejects invalid actor %j before data access [T053]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it.each(["", " ", " school", "school ", "x".repeat(257)])("rejects invalid school %j before data access [T053]", async (schoolId) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("user:opaque", schoolId)).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it("requests a pending manual membership using the authenticated User identity [T053]", async () => {
  const { db, useCase, clock } = fixture();
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result).toMatchObject({ id: expect.any(String), athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH", status: "PENDING", startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now });
  expect(db.school.findUnique).toHaveBeenCalledWith({ where: { id: "school:opaque" }, select: { id: true, status: true } });
  expect(db.schoolAthleteMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school:opaque", athleteId: "user:opaque", status: "ACTIVE" } });
  expect(db.schoolAthleteMembership.create).toHaveBeenCalledExactlyOnceWith({ data: result });
  expect(clock).toHaveBeenCalledTimes(1);
});

it.each([
  [null, "SCHOOL_NOT_FOUND", 404],
  [{ id: "school:opaque", status: "INACTIVE" }, "SCHOOL_INACTIVE", 409],
] as const)("refuses absent or inactive schools %j [T053]", async (school, code, status) => {
  const { db, useCase, clock } = fixture();
  db.school.findUnique.mockResolvedValue(school);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code, status });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
  expect(clock).not.toHaveBeenCalled();
});

it("refuses an existing active membership without modifying its period [T053]", async () => {
  const { db, rows, useCase } = fixture();
  const active = transitionSchoolAthleteMembership(createSchoolAthleteMembership({ id: "period:old", athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, now), "ACTIVE", now, "owner");
  rows.push(active);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE", status: 409 });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
  expect(rows).toEqual([active]);
});

it.each(["ENDED", "REVOKED", "REJECTED"] as const)("creates a new pending period after %s while preserving history [T053]", async (status) => {
  const { rows, useCase } = fixture();
  const pending = createSchoolAthleteMembership({ id: "period:old", athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, now);
  const previous = status === "REJECTED" ? pending : transitionSchoolAthleteMembership(pending, "ACTIVE", now, "owner");
  const ended = transitionSchoolAthleteMembership(previous, status, now, "owner");
  rows.push(ended);
  const snapshot = structuredClone(ended);
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result.id).not.toBe(ended.id);
  expect(result.status).toBe("PENDING");
  expect(result.startedAt).toBeNull();
  expect(rows).toEqual([snapshot, result]);
});
