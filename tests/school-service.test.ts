import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { SchoolService } from "@/modules/school/application/school-service";

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("School application [T014]", () => {
  it("uses the authenticated owner, generated database ID and safe defaults", async () => {
    const id = `service-${crypto.randomUUID()}`;
    const now = new Date("2026-09-08T12:00:00Z");
    await db!.user.create({ data: { id, email: `${id}@example.invalid`, status: "ACTIVE" } });
    const service = new SchoolService(db!, () => now);
    try {
      await expect(service.create(null, { name: "Aqua" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(service.create(id, { name: "Aqua", ownerUserId: "other" })).rejects.toThrow();
      const school = await service.create(id, { name: " Aqua ", slug: id });
      expect(school).toMatchObject({ ownerUserId: id, name: "Aqua", status: "ACTIVE", joinPolicy: "REQUIRE_APPROVAL", coachSelectionPolicy: "ADMIN_ASSIGNS", createdAt: now });
      expect(school.id).toMatch(/^c[a-z0-9]+$/);
      await expect(service.create(id, { name: "Duplicate", slug: id })).rejects.toMatchObject({ code: "SCHOOL_SLUG_TAKEN" });
      await expect(service.create(id, { name: " " })).rejects.toThrow();
      const generated = await service.create(id, { name: "Natação Água" });
      expect(generated.slug).toMatch(/^natacao-agua-[a-f0-9-]+$/);
      await expect(service.create(id, { name: "Aqua", status: "ACTIVE" })).rejects.toThrow();
      await expect(service.create("missing-user", { name: "Aqua" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await db!.user.update({ where: { id }, data: { status: "BLOCKED" } });
      await expect(service.create(id, { name: "Aqua" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await db!.school.deleteMany({ where: { ownerUserId: id } });
      await db!.user.delete({ where: { id } });
    }
  });
});
