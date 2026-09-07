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
