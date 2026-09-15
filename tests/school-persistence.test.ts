import { PrismaClient } from "@prisma/client";
import { afterAll, expect, it } from "vitest";

// Explicit opt-in only; never reads DATABASE_URL for test targeting.
const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
it.skipIf(!url)("enforces unique slug, owner existence and historical owner protection [T012]", async () => {
  const id = `constraints-${crypto.randomUUID()}`;
  await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
  try {
    await db!.school.create({ data: { id, name: "Aqua", slug: id, ownerUserId: id } });
    await expect(db!.school.create({ data: { name: "Other", slug: id, ownerUserId: id } })).rejects.toMatchObject({ code: "P2002" });
    await expect(db!.school.create({ data: { name: "Orphan", slug: `other-${id}`, ownerUserId: "missing-owner" } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db!.$executeRaw`DELETE FROM "User" WHERE "id" = ${id}`).rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    const ended = await db!.school.update({ where: { id }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
    expect(ended.ownerUserId).toBe(id);
    await expect(db!.$executeRaw`DELETE FROM "User" WHERE "id" = ${id}`).rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
  } finally {
    // Only synthetic fixtures in the explicitly isolated test DB.
    await db!.school.deleteMany({ where: { ownerUserId: id } });
    await db!.user.delete({ where: { id } });
  }
});

const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

it.skipIf(!db)("migration creates School with defaults [T012]", async () => {
  await db!.$transaction(async (tx) => {
    const id = `migration-${crypto.randomUUID()}`;
    await tx.user.create({ data: { id, email: `${id}@example.invalid` } });
    const rows = await tx.$queryRaw<Array<{ status: string; joinPolicy: string; coachSelectionPolicy: string }>>`
      INSERT INTO "School" ("id", "slug", "name", "ownerUserId", "updatedAt")
      VALUES (${id}, ${id}, 'Aqua', ${id}, NOW()) RETURNING "status", "joinPolicy", "coachSelectionPolicy"`;
    expect(rows).toEqual([{ status: "ACTIVE", joinPolicy: "REQUIRE_APPROVAL", coachSelectionPolicy: "ADMIN_ASSIGNS" }]);
    await tx.$executeRaw`DELETE FROM "School" WHERE "id" = ${id}`;
    await tx.user.delete({ where: { id } });
  });
});

it.skipIf(!db)("keeps membership history while preventing duplicate active periods [T020]", async () => {
  const id = `membership-${crypto.randomUUID()}`;
  await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
  const school = await db!.school.create({ data: { slug: id, name: "Aqua", ownerUserId: id } });
  try {
    const first = await db!.schoolMembership.create({ data: { schoolId: school.id, userId: id } });
    const second = await db!.schoolMembership.create({ data: { schoolId: school.id, userId: id } });
    expect(first).toMatchObject({ status: "PENDING", startedAt: null, endedAt: null });
    expect(first.id).toMatch(/^c[a-z0-9]{24}$/);
    const startedAt = new Date("2026-09-01T12:00:00.000Z");
    const endedAt = new Date("2026-09-02T12:00:00.000Z");
    await db!.schoolMembership.update({ where: { id: first.id }, data: { status: "ACTIVE", startedAt } });
    await expect(db!.schoolMembership.update({ where: { id: second.id }, data: { status: "ACTIVE", startedAt: new Date() } }))
      .rejects.toMatchObject({ code: "P2002" });
    await expect(db!.schoolMembership.create({ data: { schoolId: school.id, userId: id, status: "ACTIVE", startedAt } }))
      .rejects.toMatchObject({ code: "P2002" });
    const historical = await db!.schoolMembership.update({ where: { id: first.id }, data: { status: "ENDED", endedAt } });
    const returned = await db!.schoolMembership.create({ data: { schoolId: school.id, userId: id, status: "ACTIVE", startedAt: endedAt } });
    expect(returned.id).not.toBe(first.id);
    expect(returned.endedAt).toBeNull();
    expect(await db!.schoolMembership.findUnique({ where: { id: first.id } })).toEqual(historical);
    expect(historical).toMatchObject({ status: "ENDED", startedAt, endedAt });
    expect(await db!.schoolMembership.findUnique({ where: { id: second.id } })).toEqual(second);
    expect(await db!.schoolMembership.count({ where: { schoolId: school.id, userId: id } })).toBe(3);
  } finally {
    await db!.schoolMembership.deleteMany({ where: { schoolId: school.id } });
    await db!.school.delete({ where: { id: school.id } });
    await db!.user.delete({ where: { id } });
  }
});

it.skipIf(!db)("migration supplies membership defaults and restricts both historical parents [T020]", async () => {
  const id = `membership-fks-${crypto.randomUUID()}`;
  const ownerId = `${id}-owner`;
  await db!.user.createMany({ data: [
    { id: ownerId, email: `${ownerId}@example.invalid` },
    { id, email: `${id}@example.invalid` },
  ] });
  try {
    const school = await db!.school.create({ data: { slug: id, name: "Aqua", ownerUserId: ownerId } });
    const rows = await db!.$queryRaw<Array<{ status: string; startedAt: Date | null; endedAt: Date | null }>>`
      INSERT INTO "SchoolMembership" ("id", "schoolId", "userId", "updatedAt")
      VALUES (${id}, ${school.id}, ${id}, NOW()) RETURNING "status", "startedAt", "endedAt"`;
    expect(rows).toEqual([{ status: "PENDING", startedAt: null, endedAt: null }]);
    await expect(db!.$executeRaw`
      INSERT INTO "SchoolMembership" ("id", "schoolId", "userId", "startedAt", "updatedAt")
      VALUES (${`${id}-invalid`}, ${school.id}, ${id}, NOW(), NOW())`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    await expect(db!.$executeRaw`UPDATE "SchoolMembership" SET "startedAt" = NOW() WHERE "id" = ${id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    expect(await db!.schoolMembership.findUnique({ where: { id } })).toMatchObject({ status: "PENDING", startedAt: null });
    await expect(db!.schoolMembership.create({ data: { schoolId: `${id}-missing`, userId: id } }))
      .rejects.toMatchObject({ code: "P2003" });
    await expect(db!.schoolMembership.create({ data: { schoolId: school.id, userId: `${id}-missing` } }))
      .rejects.toMatchObject({ code: "P2003" });
    await db!.schoolMembership.update({ where: { id }, data: {
      status: "ENDED", startedAt: new Date("2026-09-01T12:00:00.000Z"), endedAt: new Date("2026-09-02T12:00:00.000Z"),
    } });
    await expect(db!.$executeRaw`DELETE FROM "School" WHERE "id" = ${school.id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    // The member is not the school owner: this proves the membership FK itself.
    await expect(db!.$executeRaw`DELETE FROM "User" WHERE "id" = ${id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    expect(await db!.schoolMembership.findUnique({ where: { id } })).toMatchObject({ status: "ENDED", userId: id });
  } finally {
    // Only synthetic fixtures in the explicitly isolated test DB.
    await db!.schoolMembership.deleteMany({ where: { userId: id } });
    await db!.school.deleteMany({ where: { ownerUserId: ownerId } });
    await db!.user.deleteMany({ where: { id: { in: [id, ownerId] } } });
  }
});
