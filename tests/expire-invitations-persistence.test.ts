import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, expect, it } from "vitest";
import { ExpireInvitations } from "@/modules/school/application/expire-invitations";

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

it.skipIf(!db)("expires due invitations inclusively and preserves terminal states, history and later timestamps [T089]", async () => {
  const rollback = new Error("Rollback expiration fixtures and maintenance changes");
  await expect(db!.$transaction(async (tx) => {
    const id = `expiration-${randomUUID()}`;
    const now = new Date("2026-09-15T12:00:00Z");
    const before = new Date(now.getTime() - 1);
    const after = new Date(now.getTime() + 1);
    await tx.user.create({ data: { id, email: `${id}@example.invalid` } });
    await tx.school.create({ data: { id, slug: id, name: "Expiration", ownerUserId: id } });
    const variants = [
      { id: `${id}-past`, expiresAt: before },
      { id: `${id}-boundary`, expiresAt: now },
      { id: `${id}-future`, expiresAt: after },
      { id: `${id}-permanent`, expiresAt: null },
      { id: `${id}-revoked`, status: "REVOKED" as const, expiresAt: before, revokedAt: before },
      { id: `${id}-exhausted`, status: "EXHAUSTED" as const, expiresAt: before, maxUses: 1, usedCount: 1 },
      { id: `${id}-expired`, status: "EXPIRED" as const, expiresAt: before },
      { id: `${id}-newer-update`, expiresAt: before, updatedAt: after },
    ];
    for (const variant of variants) {
      await tx.invitationLink.create({ data: {
        tokenHash: randomUUID(), type: "SCHOOL", schoolId: id, createdBy: id,
        requiresApproval: true, status: "ACTIVE", createdAt: before, updatedAt: before, ...variant,
      } });
    }
    const originals = await tx.invitationLink.findMany({ where: { createdBy: id }, orderBy: { id: "asc" } });
    const operation = new ExpireInvitations(tx, () => now);
    expect((await operation.execute()).expiredCount).toBeGreaterThanOrEqual(2);
    const first = await tx.invitationLink.findMany({ where: { createdBy: id }, orderBy: { id: "asc" } });
    for (const original of originals) {
      const updated = first.find((row) => row.id === original.id);
      const due = original.id === `${id}-past` || original.id === `${id}-boundary`;
      expect(updated).toEqual(due ? { ...original, status: "EXPIRED", updatedAt: now } : original);
    }
    await expect(operation.execute()).resolves.toEqual({ expiredCount: 0 });
    expect(await tx.invitationLink.findMany({ where: { createdBy: id }, orderBy: { id: "asc" } })).toEqual(first);
    // Even the global maintenance operation is rolled back; preserve preexisting test data.
    throw rollback;
  })).rejects.toBe(rollback);
});
