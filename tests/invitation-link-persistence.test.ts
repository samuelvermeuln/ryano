import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
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

it.skipIf(!db)("enforces invitation scope, limits, unique hashes and historical origins [T081]", async () => {
  const client = db!;
  await client.$queryRaw`SELECT 1 FROM "InvitationLink" LIMIT 0`;
  const id = `invitation-${randomUUID()}`;
  const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
  await client.user.create({ data: { id, email: `${id}@example.invalid` } });
  try {
    await client.school.create({ data: { id, slug: id, name: "School", ownerUserId: id } });
    await client.coachProfile.create({ data: { id, userId: id, displayName: "Coach" } });
    const link = await client.invitationLink.create({
      data: { tokenHash, type: "SCHOOL", schoolId: id, createdBy: id, requiresApproval: true },
    });
    expect(link).toMatchObject({ status: "ACTIVE", usedCount: 0, maxUses: null, expiresAt: null, revokedAt: null });
    expect(link).not.toHaveProperty("token");
    await expect(client.invitationLink.create({
      data: { tokenHash, type: "SCHOOL", schoolId: id, createdBy: id, requiresApproval: false },
    })).rejects.toMatchObject({ code: "P2002" });

    const invalidChanges = [
      Prisma.sql`"type" = 'COACH'`,
      Prisma.sql`"schoolId" = NULL`,
      Prisma.sql`"type" = 'SCHOOL_COACH'`,
      Prisma.sql`"coachId" = ${id}`,
      Prisma.sql`"tokenHash" = ' '`,
      Prisma.sql`"usedCount" = -1`,
      Prisma.sql`"maxUses" = 0`,
      Prisma.sql`"maxUses" = 1, "usedCount" = 2`,
      Prisma.sql`"status" = 'REVOKED'`,
      Prisma.sql`"revokedAt" = CURRENT_TIMESTAMP`,
      Prisma.sql`"status" = 'EXHAUSTED'`,
      Prisma.sql`"status" = 'EXHAUSTED', "maxUses" = 2, "usedCount" = 1`,
      Prisma.sql`"status" = 'EXPIRED'`,
    ];
    for (const change of invalidChanges) {
      await expect(client.$executeRaw(Prisma.sql`UPDATE "InvitationLink" SET ${change} WHERE "id" = ${link.id}`))
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    }
    for (const change of [
      Prisma.sql`"schoolId" = ${`${id}-missing`}`,
      Prisma.sql`"createdBy" = ${`${id}-missing`}`,
      Prisma.sql`"type" = 'SCHOOL_COACH', "coachId" = ${`${id}-missing`}`,
    ]) {
      await expect(client.$executeRaw(Prisma.sql`UPDATE "InvitationLink" SET ${change} WHERE "id" = ${link.id}`))
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
    }
    await client.invitationLink.update({
      where: { id: link.id }, data: { status: "REVOKED", revokedAt: new Date() },
    });
    await client.invitationLink.create({
      data: { tokenHash: `${tokenHash}-school-coach`, type: "SCHOOL_COACH", schoolId: id, coachId: id,
        createdBy: id, requiresApproval: false, maxUses: 1, usedCount: 1, status: "EXHAUSTED" },
    });
    await client.invitationLink.create({
      data: { tokenHash: `${tokenHash}-coach`, type: "COACH", coachId: id, createdBy: id,
        requiresApproval: true, status: "EXPIRED", expiresAt: new Date() },
    });
    // Test every historical origin FK directly, without competing School/Coach FKs.
    const creatorId = `${id}-creator`;
    await client.user.create({ data: { id: creatorId, email: `${creatorId}@example.invalid` } });
    await client.invitationLink.updateMany({ where: { createdBy: id }, data: { createdBy: creatorId } });
    for (const deletion of [
      Prisma.sql`DELETE FROM "User" WHERE "id" = ${creatorId}`,
      Prisma.sql`DELETE FROM "School" WHERE "id" = ${id}`,
      Prisma.sql`DELETE FROM "CoachProfile" WHERE "id" = ${id}`,
    ]) {
      await expect(client.$executeRaw(deletion))
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    }
    expect(await client.invitationLink.count({ where: { createdBy: creatorId } })).toBe(3);
  } finally {
    await client.invitationLink.deleteMany({ where: { createdBy: { in: [id, `${id}-creator`] } } });
    await client.coachProfile.deleteMany({ where: { id } });
    await client.school.deleteMany({ where: { id } });
    await client.user.deleteMany({ where: { id: { in: [id, `${id}-creator`] } } });
  }
});
