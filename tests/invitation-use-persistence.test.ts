import { randomUUID } from "node:crypto";
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

it.skipIf(!db)("preserves invitation-use outcomes, actor/athlete identity and audit references [T082]", async () => {
  const client = db!;
  await client.$queryRaw`SELECT 1 FROM "InvitationUse" LIMIT 0`;
  const id = `invitation-use-${randomUUID()}`;
  const actorId = `${id}-actor`;
  const athleteId = `${id}-athlete`;
  try {
    await client.user.createMany({ data: [id, actorId, athleteId].map((userId) => ({
      id: userId, email: `${userId}@example.invalid`,
    })) });
    await client.school.create({ data: { id, slug: id, name: "School", ownerUserId: id } });
    await client.invitationLink.create({
      data: { id, tokenHash: randomUUID(), type: "SCHOOL", schoolId: id, createdBy: id, requiresApproval: true },
    });
    const use = await client.invitationUse.create({
      data: { invitationId: id, userId: actorId, result: "FAILED" },
    });
    expect(use.athleteId).toBeNull();
    expect(use.usedAt).toBeInstanceOf(Date);
    await expect(client.invitationUse.create({
      data: { id: use.id, invitationId: id, userId: actorId, result: "FAILED" },
    })).rejects.toMatchObject({ code: "P2002" });
    const usedAt = new Date("2026-09-14T12:00:00.000Z");
    for (const result of ["PENDING_APPROVAL", "REJECTED", "JOINED", "JOINED"] as const) {
      await client.invitationUse.create({
        data: { invitationId: id, userId: actorId, athleteId, result, usedAt },
      });
    }
    const history = await client.invitationUse.findMany({
      where: { invitationId: id, athleteId }, orderBy: [{ usedAt: "asc" }, { id: "asc" }],
    });
    expect(history).toHaveLength(4);
    expect(history.every((entry) => entry.usedAt.getTime() === usedAt.getTime())).toBe(true);
    for (const change of [
      Prisma.sql`"invitationId" = ${`${id}-missing`}`,
      Prisma.sql`"userId" = ${`${id}-missing`}`,
      Prisma.sql`"athleteId" = ${`${id}-missing`}`,
    ]) {
      await expect(client.$executeRaw(Prisma.sql`UPDATE "InvitationUse" SET ${change} WHERE "id" = ${use.id}`))
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
    }
    await expect(client.$executeRaw`UPDATE "InvitationUse" SET "result" = NULL WHERE "id" = ${use.id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "23502" } });
    await expect(client.$executeRaw`UPDATE "InvitationUse" SET "result" = 'INVALID' WHERE "id" = ${use.id}`)
      .rejects.toMatchObject({ code: "P2010", meta: { code: "22P02" } });
    await client.invitationLink.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
    for (const deletion of [
      Prisma.sql`DELETE FROM "InvitationLink" WHERE "id" = ${id}`,
      Prisma.sql`DELETE FROM "User" WHERE "id" = ${actorId}`,
      Prisma.sql`DELETE FROM "User" WHERE "id" = ${athleteId}`,
    ]) {
      await expect(client.$executeRaw(deletion))
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23001" } });
    }
    expect(await client.invitationUse.count({ where: { invitationId: id } })).toBe(5);
  } finally {
    await client.invitationUse.deleteMany({ where: { invitationId: id } });
    await client.invitationLink.deleteMany({ where: { id } });
    await client.school.deleteMany({ where: { id } });
    await client.user.deleteMany({ where: { id: { in: [id, actorId, athleteId] } } });
  }
});
