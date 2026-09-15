import { PrismaClient } from "@prisma/client";
import { afterAll, expect, it } from "vitest";
import { SchoolLobbyQuery } from "@/modules/school/infrastructure/school-lobby-query";
import { RemoveCoachFromSchool } from "@/modules/school/application/remove-coach-from-school";

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

it.skipIf(!db)("derives lobby across assignment closure, school scopes and stable pages [T067]", async () => {
  const id = `lobby-${crypto.randomUUID()}`;
  const start = new Date("2026-09-11T10:00:00Z");
  const end = new Date("2026-09-11T11:00:00Z");
  try {
    await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
    await db!.coachProfile.create({ data: { id, userId: id, displayName: "Coach" } });
    await db!.school.create({ data: { id, slug: id, name: "School", ownerUserId: id } });
    await db!.schoolAthleteMembership.create({ data: { id, schoolId: id, athleteId: id, status: "ACTIVE", joinSource: "MANUAL_SEARCH", startedAt: start, approvedAt: start } });
    await db!.coachSchoolMembership.create({ data: { id, schoolId: id, coachId: id, status: "ACTIVE", startedAt: start, decidedAt: start, createdAt: start, updatedAt: start } });
    const lobby = new SchoolLobbyQuery(db!);
    expect((await lobby.listBySchool(id)).items).toMatchObject([{ athleteId: id, enteredLobbyAt: start, lastCoachId: null }]);
    const assignment = await db!.coachAthleteAssignment.create({ data: { schoolId: null, athleteId: id, coachId: id, status: "ACTIVE", startedAt: start, isPrimary: true, createdAt: start, updatedAt: start } });
    expect((await lobby.listBySchool(id)).items).toHaveLength(1);
    await db!.coachAthleteAssignment.update({ where: { id: assignment.id }, data: { schoolId: id, updatedAt: start } });
    expect((await lobby.listBySchool(id)).items).toHaveLength(0);
    await db!.coachAthleteAssignment.update({ where: { id: assignment.id }, data: { updatedAt: end } });
    await expect(new RemoveCoachFromSchool(db!, () => start).execute(id, id, id)).rejects.toThrow();
    expect(await db!.coachSchoolMembership.findUnique({ where: { id } })).toMatchObject({ status: "ACTIVE", endedAt: null });
    await new RemoveCoachFromSchool(db!, () => end).execute(id, id, id);
    expect(await db!.coachAthleteAssignment.findUnique({ where: { id: assignment.id } })).toMatchObject({ status: "ENDED", endedAt: end, endedBy: id });
    expect(await db!.schoolAthleteMembership.findUnique({ where: { id } })).toMatchObject({ status: "ACTIVE" });
    expect((await lobby.listBySchool(id)).items).toMatchObject([{ enteredLobbyAt: end, lastCoachId: id }]);
    await db!.schoolAthleteMembership.update({ where: { id }, data: { status: "ENDED", endedAt: end } });
    expect((await lobby.listBySchool(id)).items).toHaveLength(0);
  } finally {
    await db!.coachAthleteAssignment.deleteMany({ where: { athleteId: id } });
    await db!.schoolAthleteMembership.deleteMany({ where: { athleteId: id } });
    await db!.coachSchoolMembership.deleteMany({ where: { coachId: id } });
    await db!.school.deleteMany({ where: { id } });
    await db!.coachProfile.deleteMany({ where: { id } });
    await db!.user.deleteMany({ where: { id } });
  }
});

it.skipIf(!db)("closes coach assignments, retains athlete memberships and history, and derives lobby [T069/T076]", async () => {
  const prefix = `remove-${crypto.randomUUID()}`;
  const users = [prefix, `${prefix}-coach`, `${prefix}-a`, `${prefix}-b`];
  const schools = [prefix, `${prefix}-other`];
  const start = new Date("2026-09-11T10:00:00Z");
  const end = new Date("2026-09-11T11:00:00Z");
  try {
    await db!.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.invalid` })) });
    await db!.coachProfile.createMany({ data: users.slice(0, 2).map((id) => ({ id, userId: id, displayName: "Coach" })) });
    await db!.school.createMany({ data: schools.map((id) => ({ id, slug: id, name: "School", ownerUserId: prefix })) });
    await db!.coachSchoolMembership.create({ data: { id: prefix, schoolId: prefix, coachId: prefix, status: "ACTIVE", startedAt: start, decidedAt: start, createdAt: start, updatedAt: start } });
    await db!.schoolAthleteMembership.createMany({ data: users.slice(2).map((id) => ({ id, schoolId: prefix, athleteId: id, status: "ACTIVE" as const, joinSource: "MANUAL_SEARCH" as const, startedAt: start, approvedAt: start })) });
    const assignments = [
      { id: `${prefix}-target-a`, schoolId: prefix, coachId: prefix, athleteId: users[2], isPrimary: true },
      { id: `${prefix}-target-b`, schoolId: prefix, coachId: prefix, athleteId: users[3], isPrimary: true },
      { id: `${prefix}-individual`, schoolId: null, coachId: prefix, athleteId: users[2], isPrimary: true },
      { id: `${prefix}-other-school`, schoolId: schools[1], coachId: prefix, athleteId: users[2], isPrimary: true },
      { id: `${prefix}-other-coach`, schoolId: prefix, coachId: users[1], athleteId: users[3], isPrimary: false },
    ];
    await db!.coachAthleteAssignment.createMany({ data: assignments.map((assignment) => ({ ...assignment, status: "ACTIVE" as const, startedAt: start, createdAt: start, updatedAt: start })) });
    const history = await db!.coachAthleteAssignment.create({ data: { schoolId: prefix, coachId: prefix, athleteId: users[2], isPrimary: true, status: "ENDED", startedAt: start, endedAt: start, createdAt: start, updatedAt: start } });
    const priorCoachPeriod = await db!.coachSchoolMembership.create({ data: {
      schoolId: prefix, coachId: prefix, status: "ENDED", startedAt: start,
      decidedAt: start, endedAt: start, createdAt: start, updatedAt: start,
    } });
    const athleteMembershipsBefore = await db!.schoolAthleteMembership.findMany({
      where: { schoolId: prefix }, orderBy: { id: "asc" },
    });
    const assignmentsBefore = await db!.coachAthleteAssignment.findMany({
      where: { id: { in: assignments.map(({ id }) => id) } },
    });
    const lobby = new SchoolLobbyQuery(db!);
    expect((await lobby.listBySchool(prefix)).items).toEqual([]);
    await new RemoveCoachFromSchool(db!, () => end).execute(prefix, prefix, prefix);
    const rows = await db!.coachAthleteAssignment.findMany({ where: { id: { in: assignments.map(({ id }) => id) } } });
    for (const assignment of assignments) {
      const targeted = assignment.schoolId === prefix && assignment.coachId === prefix;
      expect(rows.find(({ id }) => id === assignment.id)).toMatchObject({
        ...assignment, status: targeted ? "ENDED" : "ACTIVE", startedAt: start,
        endedAt: targeted ? end : null, endedBy: targeted ? prefix : null,
      });
      const before = assignmentsBefore.find(({ id }) => id === assignment.id)!;
      expect(rows.find(({ id }) => id === assignment.id)).toEqual(targeted
        ? { ...before, status: "ENDED", endedAt: end, endedBy: prefix, updatedAt: end }
        : before);
    }
    expect(await db!.coachAthleteAssignment.findUnique({ where: { id: history.id } })).toEqual(history);
    expect(await db!.coachSchoolMembership.findUnique({ where: { id: priorCoachPeriod.id } })).toEqual(priorCoachPeriod);
    expect(await db!.schoolAthleteMembership.findMany({
      where: { schoolId: prefix }, orderBy: { id: "asc" },
    })).toEqual(athleteMembershipsBefore);
    expect(await db!.schoolAthleteMembership.count({ where: { schoolId: prefix, status: "ACTIVE" } })).toBe(2);
    expect(await db!.coachSchoolMembership.findUnique({ where: { id: prefix } })).toMatchObject({ status: "ENDED", endedAt: end });
    // Athlete B still has another active coach, so only athlete A enters the lobby.
    expect((await lobby.listBySchool(prefix)).items).toMatchObject([
      { athleteId: users[2], enteredLobbyAt: end, lastCoachId: prefix },
    ]);
    // Repeating a terminal transition must not overwrite the historical end time.
    await expect(new RemoveCoachFromSchool(db!, () => new Date(end.getTime() + 60_000))
      .execute(prefix, prefix, prefix)).rejects.toMatchObject({
        code: "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION", status: 409,
      });
    expect(await db!.coachAthleteAssignment.findMany({
      where: { id: { in: assignments.map(({ id }) => id) } }, orderBy: { id: "asc" },
    })).toEqual([...rows].sort((a, b) => a.id.localeCompare(b.id)));
  } finally {
    await db!.coachAthleteAssignment.deleteMany({ where: { athleteId: { in: users } } });
    await db!.schoolAthleteMembership.deleteMany({ where: { athleteId: { in: users } } });
    await db!.coachSchoolMembership.deleteMany({ where: { coachId: { in: users } } });
    await db!.school.deleteMany({ where: { id: { in: schools } } });
    await db!.coachProfile.deleteMany({ where: { id: { in: users } } });
    await db!.user.deleteMany({ where: { id: { in: users } } });
  }
});
