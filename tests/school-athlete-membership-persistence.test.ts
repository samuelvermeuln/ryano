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

it.skipIf(!db)("preserves athlete-school periods and enforces database constraints [T046]", async () => {
  await db!.$queryRaw`SELECT 1 FROM "SchoolAthleteMembership" LIMIT 0`;
  const id = `athlete-membership-${crypto.randomUUID()}`;
  const now = new Date("2026-09-09T16:00:00.000Z");
  await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
  try {
    await db!.school.create({ data: { id, slug: id, name: "School", ownerUserId: id } });
    const pending = await db!.schoolAthleteMembership.create({
      data: { schoolId: id, athleteId: id, joinSource: "MANUAL_SEARCH" },
    });
    expect(pending).toMatchObject({ status: "PENDING", startedAt: null, endedAt: null, joinSource: "MANUAL_SEARCH" });
    await expect(db!.$executeRaw`
      INSERT INTO "SchoolAthleteMembership" ("id", "schoolId", "athleteId", "joinSource", "startedAt", "updatedAt")
      VALUES (${`${id}-invalid`}, ${id}, ${id}, 'MANUAL_SEARCH', NOW(), NOW())`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    await db!.schoolAthleteMembership.update({ where: { id: pending.id }, data: { status: "ACTIVE", startedAt: now, approvedAt: now } });
    await expect(db!.schoolAthleteMembership.create({
      data: { schoolId: id, athleteId: id, joinSource: "MANUAL_SEARCH", status: "ACTIVE", startedAt: now },
    })).rejects.toMatchObject({ code: "P2002" });
    await db!.schoolAthleteMembership.update({ where: { id: pending.id }, data: { status: "ENDED", endedAt: now } });
    const returned = await db!.schoolAthleteMembership.create({
      data: { schoolId: id, athleteId: id, joinSource: "SCHOOL_INVITE", status: "ACTIVE", startedAt: now },
    });
    expect(returned).toMatchObject({ status: "ACTIVE", endedAt: null });
    await expect(db!.schoolAthleteMembership.create({
      data: { schoolId: id, athleteId: `${id}-missing`, joinSource: "MANUAL_SEARCH" },
    })).rejects.toMatchObject({ code: "P2003" });
    await db!.schoolAthleteMembership.update({ where: { id: returned.id }, data: { status: "ENDED", endedAt: now } });
    await expect(db!.$executeRaw`DELETE FROM "School" WHERE "id" = ${id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
  } finally {
    await db!.schoolAthleteMembership.deleteMany({ where: { athleteId: id } });
    await db!.school.deleteMany({ where: { id } });
    await db!.user.delete({ where: { id } });
  }
});
