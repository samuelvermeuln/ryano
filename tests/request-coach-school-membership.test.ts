import { expect, it, vi } from "vitest";
import { RequestCoachSchoolMembership } from "@/modules/school/application/request-coach-school-membership";
import { createCoachSchoolMembership, transitionCoachSchoolMembership, type CoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  const rows: CoachSchoolMembership[] = [];
  const db = {
    coachProfile: { findUnique: vi.fn(async () => ({ id: "coach:opaque", userId: "user:opaque" }) as { id: string; userId: string } | null) },
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", status: "ACTIVE" }) as { id: string; status: string } | null) },
    coachSchoolMembership: {
      findFirst: vi.fn(async () => rows.find((row) => row.status === "ACTIVE") ?? null),
      create: vi.fn(async ({ data }: { data: CoachSchoolMembership }) => { rows.push(data); return data; }),
    },
  };
  const clock = vi.fn(() => now);
  return { db, rows, clock, useCase: new RequestCoachSchoolMembership(db as never, clock) };
}

it("requires an authenticated coach requester [T049]", async () => {
  const useCase = new RequestCoachSchoolMembership({} as never);
  await expect(useCase.execute(null, "school")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
});

it.each(["", " ", " user", "user ", "x".repeat(257)])("rejects invalid actor %j before reading data [T049]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.coachProfile.findUnique).not.toHaveBeenCalled();
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.coachSchoolMembership.create).not.toHaveBeenCalled();
});

it.each(["", " ", " school", "school ", "x".repeat(257)])("maps invalid school %j to not found [T049]", async (schoolId) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("user:opaque", schoolId)).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.coachSchoolMembership.create).not.toHaveBeenCalled();
});

it("persists a pending request with opaque IDs and no effective access period [T049]", async () => {
  const { db, useCase, clock } = fixture();
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result).toMatchObject({
    id: expect.any(String), coachId: "coach:opaque", schoolId: "school:opaque", status: "PENDING",
    requestedAt: now, createdAt: now, updatedAt: now, decidedAt: null, startedAt: null, endedAt: null,
  });
  expect(result.id.length).toBeGreaterThan(0);
  expect(db.coachProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "user:opaque" } });
  expect(db.school.findUnique).toHaveBeenCalledWith({ where: { id: "school:opaque" }, select: { id: true, status: true } });
  expect(db.coachSchoolMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school:opaque", coachId: "coach:opaque", status: "ACTIVE" } });
  expect(db.coachSchoolMembership.create).toHaveBeenCalledExactlyOnceWith({ data: result });
  expect(clock).toHaveBeenCalledTimes(1);
});

it.each([
  ["profile", "COACH_PROFILE_NOT_FOUND", 404],
  ["school", "SCHOOL_NOT_FOUND", 404],
  ["inactive", "SCHOOL_INACTIVE", 409],
] as const)("refuses %s without writing a request [T049]", async (scenario, code, status) => {
  const { db, useCase, clock } = fixture();
  if (scenario === "profile") db.coachProfile.findUnique.mockResolvedValue(null);
  if (scenario === "school") db.school.findUnique.mockResolvedValue(null);
  if (scenario === "inactive") db.school.findUnique.mockResolvedValue({ id: "school:opaque", status: "INACTIVE" });
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code, status });
  expect(db.coachSchoolMembership.create).not.toHaveBeenCalled();
  expect(clock).not.toHaveBeenCalled();
});

it("refuses an existing active membership without modifying its period [T049]", async () => {
  const { db, rows, useCase } = fixture();
  const active = transitionCoachSchoolMembership(createCoachSchoolMembership({ id: "period:old", coachId: "coach:opaque", schoolId: "school:opaque" }, now), "ACTIVE", now);
  rows.push(active);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_ALREADY_ACTIVE", status: 409 });
  expect(db.coachSchoolMembership.create).not.toHaveBeenCalled();
  expect(rows).toEqual([active]);
});

it("creates a new pending period after termination and preserves history [T049]", async () => {
  const { rows, useCase } = fixture();
  const active = transitionCoachSchoolMembership(createCoachSchoolMembership({ id: "period:old", coachId: "coach:opaque", schoolId: "school:opaque" }, now), "ACTIVE", now);
  const ended = transitionCoachSchoolMembership(active, "ENDED", now);
  rows.push(ended);
  const snapshot = structuredClone(ended);
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result.id).not.toBe(ended.id);
  expect(result.status).toBe("PENDING");
  expect(result.startedAt).toBeNull();
  expect(rows).toEqual([snapshot, result]);
});

it("does not let a user without a coach profile request membership [T049]", async () => {
  const useCase = new RequestCoachSchoolMembership({
    coachProfile: { findUnique: async () => null },
    school: { findUnique: async () => ({ id: "school", status: "ACTIVE" }) },
  } as never);
  await expect(useCase.execute("user", "school")).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
});
