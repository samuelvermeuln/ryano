import { PrismaClient } from "@prisma/client";
import { afterAll, expect, it } from "vitest";

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

it.skipIf(!db)("preserves temporal coach-school periods and enforces database constraints [T043]", async () => {
  // Fail before creating fixtures if this migration has not been applied.
  await db!.$queryRaw`SELECT 1 FROM "CoachSchoolMembership" LIMIT 0`;
  const id = `coach-membership-${crypto.randomUUID()}`;
  await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
  try {
    await db!.coachProfile.create({ data: { id, userId: id, displayName: "Coach" } });
    await db!.school.create({ data: { id, slug: id, name: "School", ownerUserId: id } });
    const pending = await db!.coachSchoolMembership.create({ data: { coachId: id, schoolId: id } });
    expect(pending).toMatchObject({ status: "PENDING", decidedAt: null, startedAt: null, endedAt: null });
    expect(pending.id).toMatch(/^c[a-z0-9]{24}$/);
    for (const date of [pending.requestedAt, pending.createdAt, pending.updatedAt]) {
      expect(date).toBeInstanceOf(Date);
    }
    await expect(db!.$executeRaw`
      INSERT INTO "CoachSchoolMembership" ("id", "coachId", "schoolId", "startedAt", "updatedAt")
      VALUES (${`${id}-invalid`}, ${id}, ${id}, NOW(), NOW())`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    await expect(db!.$executeRaw`
      UPDATE "CoachSchoolMembership" SET "startedAt" = NOW() WHERE "id" = ${pending.id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });

    const now = new Date("2026-09-09T15:00:00.000Z");
    await db!.coachSchoolMembership.update({ where: { id: pending.id }, data: { status: "ACTIVE", decidedAt: now, startedAt: now } });
    await expect(db!.coachSchoolMembership.create({ data: { coachId: id, schoolId: id, status: "ACTIVE", startedAt: now } }))
      .rejects.toMatchObject({ code: "P2002" });
    const next = await db!.coachSchoolMembership.create({ data: { coachId: id, schoolId: id } });
    await expect(db!.coachSchoolMembership.update({ where: { id: next.id }, data: { status: "ACTIVE", startedAt: now } }))
      .rejects.toMatchObject({ code: "P2002" });
    await db!.coachSchoolMembership.update({ where: { id: pending.id }, data: { status: "ENDED", endedAt: now } });
    await db!.coachSchoolMembership.update({ where: { id: next.id }, data: { status: "ACTIVE", decidedAt: now, startedAt: now } });
    expect(await db!.coachSchoolMembership.findUnique({ where: { id: pending.id } }))
      .toMatchObject({ status: "ENDED", startedAt: now, endedAt: now, decidedAt: now });

    for (const status of ["REJECTED", "REVOKED"] as const) {
      await db!.coachSchoolMembership.create({ data: { coachId: id, schoolId: id, status, decidedAt: now } });
    }
    for (const parents of [{ coachId: `${id}-missing`, schoolId: id }, { coachId: id, schoolId: `${id}-missing` }]) {
      await expect(db!.coachSchoolMembership.create({ data: parents })).rejects.toMatchObject({ code: "P2003" });
    }
    // End all active periods: even historical links must protect both parents.
    await db!.coachSchoolMembership.update({ where: { id: next.id }, data: { status: "ENDED", endedAt: now } });
    await expect(db!.$executeRaw`DELETE FROM "CoachProfile" WHERE "id" = ${id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    await expect(db!.$executeRaw`DELETE FROM "School" WHERE "id" = ${id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    expect(await db!.coachProfile.findUnique({ where: { id }, select: { schoolMemberships: true } }))
      .toMatchObject({ schoolMemberships: expect.any(Array) });
    expect(await db!.school.findUnique({ where: { id }, select: { coachMemberships: true } }))
      .toMatchObject({ coachMemberships: expect.any(Array) });
  } finally {
    // Only this test's synthetic fixtures in the explicitly isolated database.
    await db!.coachSchoolMembership.deleteMany({ where: { coachId: id } });
    await db!.school.deleteMany({ where: { id } });
    await db!.coachProfile.deleteMany({ where: { id } });
    await db!.user.delete({ where: { id } });
  }
});
