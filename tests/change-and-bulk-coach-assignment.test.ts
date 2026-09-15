import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { BulkAssignCoach } from "@/modules/school/application/bulk-assign-coach";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment, type CoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";
import { createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const prior = new Date("2026-09-11T10:00:00Z");
const now = new Date("2026-09-12T10:00:00Z");

function fixture(withPrevious = false) {
  let rows: CoachAthleteAssignment[] = withPrevious ? [transitionCoachAthleteAssignment(createCoachAthleteAssignment({ id: "old", schoolId: "school", athleteId: "athlete", coachId: "old-coach", isPrimary: true, sportType: null }, prior), "ACTIVE", prior, "owner")] : [];
  const tx = {
    schoolMembership: { findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => where.userId === "owner" ? { id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null } : null) },
    schoolMembershipRole: { findMany: vi.fn(async () => [{ membershipId: "manager", role: "OWNER" }]) },
    school: { findUnique: vi.fn(async () => ({ id: "school", ownerUserId: "owner", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    schoolAthleteMembership: { findFirst: vi.fn(async ({ where }: { where: { athleteId: string } }) => transitionSchoolAthleteMembership(createSchoolAthleteMembership({ id: `membership-${where.athleteId}`, schoolId: "school", athleteId: where.athleteId, joinSource: "MANUAL_SEARCH" }, prior), "ACTIVE", prior)) },
    coachSchoolMembership: { findFirst: vi.fn(async () => transitionCoachSchoolMembership(createCoachSchoolMembership({ id: "coach-membership", schoolId: "school", coachId: "coach" }, prior), "ACTIVE", prior)) },
    coachAthleteAssignment: {
      findFirst: vi.fn(async ({ where }: { where: { athleteId: string } }) => rows.find((row) => row.athleteId === where.athleteId && row.status === "ACTIVE") ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CoachAthleteAssignment> }) => {
        const index = rows.findIndex((row) => row.id === where.id);
        rows[index] = { ...rows[index], ...data };
        return rows[index];
      }),
      create: vi.fn(async ({ data }: { data: CoachAthleteAssignment }) => { rows.push(data); return data; }),
    },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => {
    const snapshot = structuredClone(rows);
    try { return await run(tx); } catch (error) { rows = snapshot; throw error; }
  }) };
  return { tx, db, rows: () => rows, change: new ChangeAthleteCoach(db as never, () => now), bulk: new BulkAssignCoach(db as never, () => now) };
}

it("ends the previous period and creates a distinct active one with identical transition time [T065]", async () => {
  const f = fixture(true);
  const original = structuredClone(f.rows()[0]);
  const next = await f.change.execute("owner", "school", "athlete", "coach");
  expect(next).toMatchObject({ coachId: "coach", startedAt: now, assignedBy: "owner", status: "ACTIVE" });
  expect(next.id).not.toBe(original.id);
  expect(f.rows()[0]).toEqual({ ...original, status: "ENDED", endedAt: now, endedBy: "owner", updatedAt: now });
  expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

it("rolls the old period back if the new assignment cannot be persisted [T065]", async () => {
  const f = fixture(true);
  const original = structuredClone(f.rows());
  f.tx.coachAthleteAssignment.create.mockRejectedValue(new Error("storage unavailable"));
  await expect(f.change.execute("owner", "school", "athlete", "coach")).rejects.toThrow("storage unavailable");
  expect(f.rows()).toEqual(original);
});

it.each(["missing", "same-coach"])("rejects %s transition without closing history [T065]", async (scenario) => {
  const f = fixture(scenario !== "missing");
  await expect(f.change.execute("owner", "school", "athlete", scenario === "same-coach" ? "old-coach" : "coach")).rejects.toMatchObject({ status: scenario === "missing" ? 404 : 409 });
  expect(f.tx.coachAthleteAssignment.update).not.toHaveBeenCalled();
});

it("authorizes before reading an athlete's assignment [T065]", async () => {
  const f = fixture(true);
  await expect(f.change.execute("outsider", "school", "athlete", "coach")).rejects.toMatchObject({ status: 403 });
  expect(f.tx.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
});

it("assigns the whole batch in one transaction and timestamp [T070]", async () => {
  const f = fixture();
  const result = await f.bulk.execute("owner", "school", { coachId: "coach", athleteIds: ["athlete", "second"] });
  expect(result.items).toHaveLength(2);
  expect(result.items.map((row) => row.athleteId)).toEqual(["athlete", "second"]);
  expect(result.items.every((row) => row.startedAt?.getTime() === now.getTime())).toBe(true);
  expect(f.db.$transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { isolationLevel: "Serializable", timeout: 30_000 });
});

it("rolls back an earlier athlete when the later one conflicts [T070]", async () => {
  const f = fixture(true);
  const original = structuredClone(f.rows());
  await expect(f.bulk.execute("owner", "school", { coachId: "coach", athleteIds: ["second", "athlete"] })).rejects.toMatchObject({ status: 409 });
  expect(f.tx.coachAthleteAssignment.create).toHaveBeenCalledTimes(1);
  expect(f.rows()).toEqual(original);
});

it.each([
  null, {}, { coachId: "coach", athleteIds: [] }, { coachId: "coach", athleteIds: ["athlete", "athlete"] },
  { coachId: "coach", athleteIds: [" bad "] }, { coachId: "", athleteIds: ["athlete"] },
  { coachId: "coach", athleteIds: Array.from({ length: 101 }, (_, i) => `athlete-${i}`) },
  { coachId: "coach", athleteIds: ["athlete"], ownerUserId: "owner" },
])("rejects invalid batch %j before transaction [T070]", async (raw) => {
  const f = fixture();
  await expect(f.bulk.execute("owner", "school", raw)).rejects.toMatchObject({ status: 400 });
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

it.each(["change", "bulk"] as const)("validates authentication and IDs for %s before transaction", async (kind) => {
  const f = fixture();
  const run = (actor: string | null, school: string) => kind === "change" ? f.change.execute(actor, school, "athlete", "coach") : f.bulk.execute(actor, school, { coachId: "coach", athleteIds: ["athlete"] });
  await expect(run(null, "school")).rejects.toMatchObject({ status: 401 });
  await expect(run("owner", " bad ")).rejects.toMatchObject({ status: 400 });
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

it.each(["P2002", "P2025", "P2034"])("maps concurrent storage conflict %s in both workflows", async (code) => {
  const f = fixture(true);
  f.db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "6" }));
  await expect(f.change.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
  await expect(f.bulk.execute("owner", "school", { coachId: "coach", athleteIds: ["athlete"] })).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
});

it("accepts the maximum batch with distinct primary assignments and one clock reading [T077]", async () => {
  const f = fixture();
  const clock = vi.fn(() => now);
  const bulk = new BulkAssignCoach(f.db as never, clock);
  const athleteIds = Array.from({ length: 100 }, (_, index) => `athlete-${index}`);

  const result = await bulk.execute("owner", "school", { coachId: "coach", athleteIds });

  expect(result.items.map((row) => row.athleteId)).toEqual(athleteIds);
  expect(new Set(result.items.map((row) => row.id)).size).toBe(100);
  expect(result.items).toEqual(athleteIds.map((athleteId) => expect.objectContaining({
    athleteId, schoolId: "school", coachId: "coach", status: "ACTIVE",
    isPrimary: true, sportType: null, assignedBy: "owner", startedAt: now, endedAt: null,
  })));
  expect(f.rows()).toEqual(result.items);
  expect(clock).toHaveBeenCalledTimes(1);
  expect(f.db.$transaction).toHaveBeenCalledTimes(1);
});

it("rejects a repeated athlete before writing or opening a transaction [T077]", async () => {
  const f = fixture();
  await expect(f.bulk.execute("owner", "school", {
    coachId: "coach", athleteIds: ["athlete", "second", "athlete"],
  })).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
  expect(f.db.$transaction).not.toHaveBeenCalled();
  expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("rejects unauthorized bulk access before reading memberships [T077]", async () => {
  const f = fixture();
  await expect(f.bulk.execute("outsider", "school", {
    coachId: "coach", athleteIds: ["athlete", "second"],
  })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(f.tx.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  expect(f.tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
  expect(f.tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it.each(["P2002", "P2025", "P2034", "unexpected"])(
  "rolls back the batch on a later persistence failure (%s), preserving previous history [T077]",
  async (code) => {
    const f = fixture(true);
    const original = structuredClone(f.rows());
    const failure = code === "unexpected" ? new Error("storage unavailable")
      : new Prisma.PrismaClientKnownRequestError("concurrent write", { code, clientVersion: "6" });
    f.tx.coachAthleteAssignment.create
      .mockImplementationOnce(async ({ data }) => { f.rows().push(data); return data; })
      .mockRejectedValueOnce(failure);

    const result = f.bulk.execute("owner", "school", {
      coachId: "coach", athleteIds: ["second", "third", "fourth"],
    });
    if (code === "unexpected") await expect(result).rejects.toBe(failure);
    else await expect(result).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
    expect(f.tx.coachAthleteAssignment.create).toHaveBeenCalledTimes(2);
    expect(f.rows()).toEqual(original);
    expect(f.tx.coachAthleteAssignment.update).not.toHaveBeenCalled();
  },
);
