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

it.skipIf(!db)("persists an independent unique coach profile and protects its historical user [T040]", async () => {
  const id = `coach-${crypto.randomUUID()}`;
  await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
  try {
    const rows = await db!.$queryRaw<Array<{ status: string; bio: string | null }>>`
      INSERT INTO "CoachProfile" ("id", "userId", "displayName", "updatedAt")
      VALUES (${id}, ${id}, 'Coach', NOW()) RETURNING "status", "bio"`;
    expect(rows).toEqual([{ status: "ACTIVE", bio: null }]);
    await expect(db!.$executeRaw`
      INSERT INTO "CoachProfile" ("id", "userId", "displayName", "updatedAt")
      VALUES (${`${id}-duplicate`}, ${id}, 'Other', NOW())`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23505" } });
    await expect(db!.$executeRaw`
      INSERT INTO "CoachProfile" ("id", "userId", "displayName", "updatedAt")
      VALUES (${`${id}-orphan`}, ${`${id}-missing`}, 'Other', NOW())`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
    for (const status of ["INACTIVE", "SUSPENDED"]) {
      await db!.$executeRaw`UPDATE "CoachProfile" SET "status" = ${status}::"CoachStatus" WHERE "id" = ${id}`;
      await expect(db!.$executeRaw`DELETE FROM "User" WHERE "id" = ${id}`)
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    }
    await db!.$executeRaw`DELETE FROM "CoachProfile" WHERE "id" = ${id}`;
    const profile = await db!.coachProfile.create({ data: { userId: id, displayName: "Coach" } });
    expect(profile.id).toMatch(/^c[a-z0-9]{24}$/);
    expect(profile.createdAt).toBeInstanceOf(Date);
    expect(profile.updatedAt).toBeInstanceOf(Date);
    expect(await db!.user.findUnique({ where: { id }, select: { coachProfile: true } }))
      .toEqual({ coachProfile: profile });
  } finally {
    // Only synthetic fixtures in the explicitly isolated database.
    await db!.$executeRaw`DELETE FROM "CoachProfile" WHERE "userId" = ${id}`;
    await db!.user.delete({ where: { id } });
  }
});
