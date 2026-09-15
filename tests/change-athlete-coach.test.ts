import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment, type CoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";
import { createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const prior = new Date("2026-09-11T10:00:00Z");
const now = new Date("2026-09-12T10:00:00Z");

function fixture() {
  const active = (id: string, schoolId = "school", isPrimary = true) => transitionCoachAthleteAssignment(
    createCoachAthleteAssignment({ id, schoolId, athleteId: "athlete", coachId: "old-coach", isPrimary, sportType: null }, prior),
    "ACTIVE", prior, "owner",
  );
  let rows = [active("old"), active("secondary", "school", false), active("other-school", "other-school")];
  const athlete = transitionSchoolAthleteMembership(createSchoolAthleteMembership({ id: "athlete-period", schoolId: "school", athleteId: "athlete", joinSource: "MANUAL_SEARCH" }, prior), "ACTIVE", prior);
  const coach = transitionCoachSchoolMembership(createCoachSchoolMembership({ id: "coach-period", schoolId: "school", coachId: "coach" }, prior), "ACTIVE", prior);
  const tx = {
    schoolMembership: { findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => where.userId === "owner" ? { id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null } : null) },
    schoolMembershipRole: { findMany: vi.fn(async () => [{ membershipId: "manager", role: "OWNER" }]) },
    school: { findUnique: vi.fn(async () => ({ id: "school", ownerUserId: "owner", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    schoolAthleteMembership: { findFirst: vi.fn(async () => athlete as typeof athlete | null) },
    coachSchoolMembership: { findFirst: vi.fn(async ({ where }: { where: { coachId: string } }) => ({ ...coach, coachId: where.coachId }) as typeof coach | null) },
    coachAthleteAssignment: {
      findFirst: vi.fn(async ({ where }: { where: Partial<CoachAthleteAssignment> }) => rows.find((row) => Object.entries(where).every(([key, value]) => row[key as keyof CoachAthleteAssignment] === value)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CoachAthleteAssignment> }) => {
        const index = rows.findIndex((row) => row.id === where.id);
        rows[index] = { ...rows[index], ...data };
        return rows[index];
      }),
      create: vi.fn(async ({ data }: { data: CoachAthleteAssignment }) => { rows.push(data); return data; }),
    },
  };
  // Models rollback for use-case unit tests; real PostgreSQL isolation needs integration validation.
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => {
    const snapshot = structuredClone(rows);
    try { return await run(tx); } catch (error) { rows = snapshot; throw error; }
  }) };
  const clock = vi.fn(() => now);
  return { tx, db, clock, rows: () => rows, useCase: new ChangeAthleteCoach(db as never, clock) };
}

it("atomically replaces only the active primary period in the target school [T065]", async () => {
  const f = fixture();
  const original = structuredClone(f.rows());
  const next = await f.useCase.execute("owner", "school", "athlete", "coach");
  expect(next).toMatchObject({ schoolId: "school", athleteId: "athlete", coachId: "coach", isPrimary: true, status: "ACTIVE", startedAt: now, endedAt: null, assignedBy: "owner", endedBy: null });
  expect(next.id).not.toBe(original[0].id);
  expect(f.rows()).toEqual([{ ...original[0], status: "ENDED", endedAt: now, endedBy: "owner", updatedAt: now }, ...original.slice(1), next]);
  expect(f.tx.coachAthleteAssignment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "old", status: "ACTIVE", updatedAt: prior } }));
  expect(f.db.$transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { isolationLevel: "Serializable" });
  expect(f.clock).toHaveBeenCalledTimes(1);
});

it("creates a third period when returning to the original coach without reopening history [T065]", async () => {
  const f = fixture();
  const next = await f.useCase.execute("owner", "school", "athlete", "coach");
  const firstClosed = structuredClone(f.rows()[0]);
  const later = new Date("2026-09-13T10:00:00Z");
  f.clock.mockReturnValue(later);
  const returned = await f.useCase.execute("owner", "school", "athlete", "old-coach");
  expect(new Set(["old", next.id, returned.id]).size).toBe(3);
  expect(f.rows()[0]).toEqual(firstClosed);
  expect(f.rows().find((row) => row.id === next.id)).toEqual({ ...next, status: "ENDED", endedAt: later, endedBy: "owner", updatedAt: later });
  expect(returned).toMatchObject({ coachId: "old-coach", startedAt: later, endedAt: null, status: "ACTIVE" });
});

it.each(["athlete", "coach"])("restores the original period if the %s membership is inactive [T065]", async (member) => {
  const f = fixture();
  const original = structuredClone(f.rows());
  if (member === "athlete") f.tx.schoolAthleteMembership.findFirst.mockResolvedValue(null);
  else f.tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
  await expect(f.useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ code: member === "athlete" ? "SCHOOL_ATHLETE_MEMBERSHIP_NOT_ACTIVE" : "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 409 });
  expect(f.rows()).toEqual(original);
  expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it.each(["update", "create"] as const)("rolls back and preserves unexpected %s errors [T065]", async (operation) => {
  const f = fixture();
  const original = structuredClone(f.rows());
  const error = new Error("storage unavailable");
  f.tx.coachAthleteAssignment[operation].mockRejectedValue(error);
  await expect(f.useCase.execute("owner", "school", "athlete", "coach")).rejects.toBe(error);
  expect(f.rows()).toEqual(original);
});

it.each(["P2002", "P2025", "P2034"])("maps %s on creation to conflict and restores the previous period [T065]", async (code) => {
  const f = fixture();
  const original = structuredClone(f.rows());
  f.tx.coachAthleteAssignment.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "6" }));
  await expect(f.useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
  expect(f.rows()).toEqual(original);
});

it.each(["missing", "same-coach", "disappeared"])("rejects a %s previous assignment without creating a replacement [T065]", async (scenario) => {
  const f = fixture();
  if (scenario === "missing") f.tx.coachAthleteAssignment.findFirst.mockResolvedValue(null);
  if (scenario === "disappeared") f.tx.coachAthleteAssignment.findUnique.mockResolvedValue(null);
  await expect(f.useCase.execute("owner", "school", "athlete", scenario === "same-coach" ? "old-coach" : "coach")).rejects.toMatchObject({ status: scenario === "missing" ? 404 : 409 });
  expect(f.tx.coachAthleteAssignment.update).not.toHaveBeenCalled();
  expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it.each(["missing", "inactive", "other-owner"])("rejects %s school before reading assignment history [T065]", async (scenario) => {
  const f = fixture();
  f.tx.school.findUnique.mockResolvedValue(scenario === "missing" ? null : { id: "school", ownerUserId: scenario === "other-owner" ? "other" : "owner", status: scenario === "inactive" ? "INACTIVE" : "ACTIVE" });
  await expect(f.useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ status: scenario === "missing" ? 404 : scenario === "inactive" ? 409 : 403 });
  expect(f.tx.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
});

it.each([null, "", " owner", "x".repeat(257)])("rejects invalid actor %j before transaction [T065]", async (actor) => {
  const f = fixture();
  await expect(f.useCase.execute(actor, "school", "athlete", "coach")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("validates target ID at position %i before transaction [T065]", async (position) => {
  const f = fixture();
  const ids: [string, string, string] = ["school", "athlete", "coach"];
  ids[position] = " bad ";
  await expect(f.useCase.execute("owner", ...ids)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

it("keeps the athlete's school membership and continuous primary coverage across a transfer [T075]", async () => {
  const f = fixture();
  const membership = await f.tx.schoolAthleteMembership.findFirst();
  const originalMembership = structuredClone(membership);

  const replacement = await f.useCase.execute("owner", "school", "athlete", "coach");

  expect(await f.tx.schoolAthleteMembership.findFirst()).toEqual(originalMembership);
  expect(membership).toMatchObject({ status: "ACTIVE", endedAt: null });
  const periods = f.rows().filter((row) => row.schoolId === "school" && row.athleteId === "athlete" && row.isPrimary);
  expect(periods.filter((row) => row.status === "ACTIVE")).toEqual([replacement]);
  expect(periods.find((row) => row.id === "old")?.endedAt).toEqual(replacement.startedAt);
  expect(f.tx.schoolAthleteMembership.findFirst).toHaveBeenCalledWith({
    where: { schoolId: "school", athleteId: "athlete", status: "ACTIVE" },
  });
  expect(f.tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({
    where: { schoolId: "school", coachId: "coach", status: "ACTIVE" },
  });
});

it.each(["P2025", "P2034"])("preserves history when closing the previous assignment fails with %s [T075]", async (code) => {
  const f = fixture();
  const original = structuredClone(f.rows());
  f.tx.coachAthleteAssignment.update.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("concurrent transfer", { code, clientVersion: "6" }),
  );

  await expect(f.useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({
    code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409,
  });

  expect(f.rows()).toEqual(original);
  expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("rejects a duplicate transfer without modifying the newly created period [T075]", async () => {
  const f = fixture();
  await f.useCase.execute("owner", "school", "athlete", "coach");
  const history = structuredClone(f.rows());
  f.tx.coachAthleteAssignment.update.mockClear();
  f.tx.coachAthleteAssignment.create.mockClear();

  await expect(f.useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({
    code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409,
  });

  expect(f.rows()).toEqual(history);
  expect(f.tx.coachAthleteAssignment.update).not.toHaveBeenCalled();
  expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});
