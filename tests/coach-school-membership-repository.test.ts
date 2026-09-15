import { PrismaClient } from "@prisma/client";
import { afterAll, expect, it } from "vitest";
import { createCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { MembershipStatus } from "@/modules/school/domain/enums";
import { CoachSchoolMembershipRepository } from "@/modules/school/infrastructure/coach-school-membership-repository";

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

it.skipIf(!db)("persists temporal periods, isolates scopes, and rejects concurrent approvals [T045]", async () => {
  const id = `repo-coach-${crypto.randomUUID()}`;
  const now = new Date("2026-09-09T10:00:00Z");
  const later = new Date("2026-09-10T10:00:00Z");
  const repo = new CoachSchoolMembershipRepository(db!);
  await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
  try {
    await db!.coachProfile.create({ data: { id, userId: id, displayName: "Coach" } });
    await db!.school.create({ data: { id, slug: id, name: "School", ownerUserId: id } });
    const first = createCoachSchoolMembership({ id: `${id}-1`, coachId: id, schoolId: id }, now);
    const second = createCoachSchoolMembership({ id: `${id}-2`, coachId: id, schoolId: id }, now);
    expect(await repo.create(first)).toEqual(first);
    await db!.$transaction(async (tx) => {
      expect(await new CoachSchoolMembershipRepository(tx).create(second)).toEqual(second);
    });
    expect(await repo.findById(first.id)).toEqual(first);
    expect(await repo.findById(`${id}-absent`)).toBeNull();
    expect(await repo.findActiveBySchoolAndCoach(id, id)).toBeNull();
    const race = await Promise.allSettled([
      repo.updateStatus(first.id, MembershipStatus.ACTIVE, later),
      repo.updateStatus(second.id, MembershipStatus.ACTIVE, later),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "P2002" } });
    const active = (await repo.findActiveBySchoolAndCoach(id, id))!;
    expect(active).toMatchObject({ requestedAt: now, decidedAt: later, startedAt: later, endedAt: null });
    expect(await repo.findActiveBySchoolAndCoach(`${id}-other`, id)).toBeNull();
    const pendingId = active.id === first.id ? second.id : first.id;
    const ended = await repo.updateStatus(active.id, MembershipStatus.ENDED, later);
    expect(ended).toMatchObject({ startedAt: later, endedAt: later, decidedAt: later });
    await repo.updateStatus(pendingId, MembershipStatus.ACTIVE, later);
    await expect(repo.updateStatus(active.id, MembershipStatus.ACTIVE, later)).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION" });
    expect(await repo.updateStatus(`${id}-absent`, MembershipStatus.ACTIVE, later)).toBeNull();
    for (const method of ["listBySchool", "listByCoach"] as const) {
      const page = await repo[method](id, { limit: 1 });
      expect(page.items.map((item) => item.id)).toEqual([first.id]);
      const next = await repo[method](id, { limit: 1, cursor: page.nextCursor! });
      expect(next.items.map((item) => item.id)).toEqual([second.id]);
      expect(next.nextCursor).toBeNull();
      expect((await repo[method](`${id}-other`)).items).toEqual([]);
      await expect(repo[method](id, { limit: 101 })).rejects.toThrow();
      await expect(repo[method](id, { cursor: "broken" })).rejects.toThrow();
    }
    await expect(repo.create({ ...first, id: `${id}-invalid`, decidedAt: later })).rejects.toThrow();
    expect(await repo.findById(`${id}-invalid`)).toBeNull();
  } finally {
    await db!.coachSchoolMembership.deleteMany({ where: { coachId: id } });
    await db!.school.deleteMany({ where: { id } });
    await db!.coachProfile.deleteMany({ where: { id } });
    await db!.user.delete({ where: { id } });
  }
});
