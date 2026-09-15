import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createSchool } from "@/modules/school/domain/school";
import { SchoolRepository } from "@/modules/school/infrastructure/school-repository";

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("School repository [T013]", () => {
  it("persists identity and supports reversible status transitions without replacing history", async () => {
    const id = `repository-${crypto.randomUUID()}`;
    const now = new Date("2026-09-08T10:00:00Z");
    await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
    const repo = new SchoolRepository(db!);
    try {
      const school = createSchool({ id, slug: id, name: "Aqua", ownerUserId: id }, now);
      expect(await repo.create(school)).toEqual(school);
      expect(await repo.findById(id)).toEqual(school);
      expect(await repo.findBySlug(id)).toEqual(school);
      await expect(repo.create({ ...school, id: `${id}-duplicate` })).rejects.toMatchObject({ code: "P2002" });
      const updated = await repo.update(id, { name: "Aqua II", description: "Swimming" }, now);
      expect(updated).toMatchObject({ name: "Aqua II", ownerUserId: id, createdAt: now });
      const endedAt = new Date("2026-09-09T10:00:00Z");
      expect(await repo.deactivate(id, endedAt)).toMatchObject({ status: "INACTIVE", deactivatedAt: endedAt });
      expect(await repo.deactivate(id, new Date("2026-09-10"))).toMatchObject({ deactivatedAt: endedAt });
      expect(await repo.reactivate(id, new Date("2026-09-11"))).toMatchObject({ id, status: "ACTIVE", deactivatedAt: null, createdAt: now });
      await expect(repo.update(id, { ownerUserId: "other" } as never, now)).rejects.toThrow();
      await expect(repo.update(id, { name: " " }, now)).rejects.toThrow();
      await expect(repo.update(id, {}, new Date("invalid"))).rejects.toThrow();
      expect(await repo.findById("absent-school")).toBeNull();
    } finally {
      await db!.school.deleteMany({ where: { ownerUserId: id } });
      await db!.user.delete({ where: { id } });
    }
  });

  it("paginates duplicate names deterministically and keeps inactive schools out of discovery", async () => {
    const id = `search-${crypto.randomUUID()}`;
    const now = new Date();
    await db!.user.create({ data: { id, email: `${id}@example.invalid` } });
    const repo = new SchoolRepository(db!);
    try {
      for (const suffix of ["a", "b", "c"]) {
        await repo.create(createSchool({ id: `${id}-${suffix}`, slug: `${id}-${suffix}`, name: `${id} Aqua`, ownerUserId: id }, now));
      }
      await repo.deactivate(`${id}-c`, now);
      const first = await repo.searchByName(id.toUpperCase(), { limit: 1 });
      expect(first.items.map((school) => school.id)).toEqual([`${id}-a`]);
      expect(first.nextCursor).toBeTruthy();
      const second = await repo.searchByName(id, { limit: 1, cursor: first.nextCursor! });
      expect(second.items.map((school) => school.id)).toEqual([`${id}-b`]);
      expect(second.nextCursor).toBeNull();
      await expect(repo.searchByName(id, { limit: 101 })).rejects.toThrow();
      await expect(repo.searchByName(id, { cursor: "not-a-cursor" })).rejects.toThrow();
    } finally {
      await db!.school.deleteMany({ where: { ownerUserId: id } });
      await db!.user.delete({ where: { id } });
    }
  });
});
