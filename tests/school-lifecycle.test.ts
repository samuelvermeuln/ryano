import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe.skipIf(!db)("School lifecycle", () => {
  let owner: string;
  let outsider: string;
  let schoolId: string;
  let now: Date;
  let service: SchoolService;
  beforeEach(async () => {
    owner = `lifecycle-${crypto.randomUUID()}`;
    outsider = `${owner}-other`;
    now = new Date("2026-09-08T12:00:00Z");
    await db!.user.createMany({ data: [owner, outsider].map((id) => ({ id, email: `${id}@example.invalid`, status: "ACTIVE" })) });
    service = new SchoolService(db!, () => now);
    schoolId = (await service.create(owner, { name: "Aqua", slug: owner })).id;
  });
  afterEach(async () => {
    await db!.school.deleteMany({ where: { ownerUserId: { in: [owner, outsider] } } });
    await db!.user.deleteMany({ where: { id: { in: [owner, outsider] } } });
  });

  it("updates only editable fields for the owner and rejects invalid or conflicting input [T015]", async () => {
    now = new Date("2026-09-09T12:00:00Z");
    await expect(service.update(null, schoolId, { name: "Other" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(service.update(outsider, schoolId, { name: "Other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db!.user.update({ where: { id: outsider }, data: { role: "ADMIN" } });
    await expect(service.update(outsider, schoolId, { name: "Other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.update(owner, "missing-school", { name: "Other" })).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND" });
    for (const input of [{}, { name: undefined }, { name: " " }, { id: schoolId }, { ownerUserId: outsider }, { status: "INACTIVE" }]) {
      await expect(service.update(owner, schoolId, input)).rejects.toThrow();
    }
    const other = await service.create(outsider, { name: "Other", slug: outsider });
    await expect(service.update(owner, schoolId, { slug: other.slug })).rejects.toMatchObject({ code: "SCHOOL_SLUG_TAKEN" });
    expect(await service.update(owner, schoolId, { name: " Aqua II ", description: null })).toMatchObject({
      id: schoolId, name: "Aqua II", ownerUserId: owner, updatedAt: now, createdAt: new Date("2026-09-08T12:00:00Z"),
    });
  });

  it.each(["deactivate", "reactivate"] as const)("authorizes only the owner for %s [T016/T017]", async (operation) => {
    await expect(service[operation](null, schoolId)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    await expect(service[operation](outsider, schoolId)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await db!.user.update({ where: { id: outsider }, data: { role: "ADMIN" } });
    await expect(service[operation](outsider, schoolId)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(service[operation](owner, "missing-school")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
    expect(await db!.school.findUniqueOrThrow({ where: { id: schoolId } })).toMatchObject({
      status: "ACTIVE", deactivatedAt: null, updatedAt: now,
    });
  });

  it.each(["update", "deactivate", "reactivate"] as const)("returns stable errors for malformed identifiers in %s [T015/T016/T017]", async (operation) => {
    for (const invalidId of ["", " ", " padded ", "x".repeat(257)]) {
      await expect(service[operation](invalidId, schoolId, { name: "Other" })).rejects.toMatchObject({
        name: "SchoolError", code: "UNAUTHORIZED", status: 401,
      });
      await expect(service[operation](owner, invalidId, { name: "Other" })).rejects.toMatchObject({
        name: "SchoolError", code: "SCHOOL_NOT_FOUND", status: 404,
      });
    }
  });

  it("deactivates and reactivates idempotently while preserving school identity [T016/T017]", async () => {
    const createdAt = now;
    now = new Date("2026-09-09T12:00:00Z");
    const deactivatedAt = now;
    expect(await service.deactivate(owner, schoolId)).toMatchObject({
      id: schoolId, ownerUserId: owner, status: "INACTIVE", createdAt, updatedAt: now, deactivatedAt,
    });
    now = new Date("2026-09-10T12:00:00Z");
    expect(await service.deactivate(owner, schoolId)).toMatchObject({
      status: "INACTIVE", deactivatedAt, updatedAt: deactivatedAt,
    });
    const reactivatedAt = now;
    expect(await service.reactivate(owner, schoolId)).toMatchObject({
      id: schoolId, ownerUserId: owner, status: "ACTIVE", createdAt, updatedAt: now, deactivatedAt: null,
    });
    now = new Date("2026-09-11T12:00:00Z");
    expect(await service.reactivate(owner, schoolId)).toMatchObject({
      status: "ACTIVE", deactivatedAt: null, updatedAt: reactivatedAt,
    });
  });
});
