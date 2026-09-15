import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanDeactivateSchool } from "@/modules/school/application/can-deactivate-school";
import { CanManageSchool } from "@/modules/school/application/can-manage-school";
import { SchoolService } from "@/modules/school/application/school-service";
import { SchoolMembershipRepository } from "@/modules/school/infrastructure/school-membership-repository";

// Explicit opt-in only: never fall back to the application's DATABASE_URL.
const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("CreateSchool + Owner integration [T039]", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  let ownerId: string;
  let service: SchoolService;

  beforeEach(async () => {
    ownerId = `owner-integration-${crypto.randomUUID()}`;
    await db!.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid`, status: "ACTIVE" } });
    service = new SchoolService(db!, () => now);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Delete only this test's synthetic records, in historical-FK dependency order.
    await db!.schoolMembershipRole.deleteMany({ where: { membership: { userId: ownerId } } });
    await db!.schoolMembership.deleteMany({ where: { userId: ownerId } });
    await db!.school.deleteMany({ where: { ownerUserId: ownerId } });
    await db!.user.delete({ where: { id: ownerId } });
  });

  it("commits an active owner period that immediately grants school management", async () => {
    const school = await service.create(ownerId, { name: "Owner school", slug: ownerId });
    expect(await db!.school.findUnique({ where: { id: school.id } })).toMatchObject({ ownerUserId: ownerId, createdAt: now });
    const periods = await db!.schoolMembership.findMany({ where: { schoolId: school.id }, include: { roles: true } });
    expect(periods).toHaveLength(1);
    const [period] = periods;
    expect(period).toMatchObject({
      schoolId: school.id, userId: ownerId, status: "ACTIVE", startedAt: now, endedAt: null, createdAt: now,
    });
    expect(period.roles).toEqual([{ id: expect.any(String), membershipId: period.id, role: "OWNER", createdAt: now }]);

    const repository = new SchoolMembershipRepository(db!);
    await expect(new CanManageSchool(repository).execute(ownerId, school.id)).resolves.toBe(true);
    await expect(new CanDeactivateSchool(repository).execute(ownerId, school.id)).resolves.toBe(true);
    await expect(service.update(ownerId, school.id, { name: "Managed by owner" })).resolves.toMatchObject({ name: "Managed by owner" });

    await expect(service.create(ownerId, { name: "Duplicate", slug: ownerId })).rejects.toMatchObject({ code: "SCHOOL_SLUG_TAKEN" });
    expect(await db!.school.count({ where: { ownerUserId: ownerId } })).toBe(1);
    expect(await db!.schoolMembership.findMany({ where: { schoolId: school.id }, include: { roles: true } })).toEqual(periods);
  });

  it("rolls back the school and active period when initial OWNER assignment fails", async () => {
    // Only the failure is injected; SchoolService and both repositories use the real DB transaction.
    const failure = new Error("Injected owner assignment failure");
    const addRole = vi.spyOn(SchoolMembershipRepository.prototype, "addRole").mockRejectedValueOnce(failure);
    await expect(service.create(ownerId, { name: "Rollback school", slug: ownerId })).rejects.toBe(failure);
    expect(addRole).toHaveBeenCalledOnce();
    expect(await db!.school.count({ where: { ownerUserId: ownerId } })).toBe(0);
    expect(await db!.schoolMembership.count({ where: { userId: ownerId } })).toBe(0);
    expect(await db!.schoolMembershipRole.count({ where: { membership: { userId: ownerId } } })).toBe(0);

    addRole.mockRestore();
    await expect(service.create(ownerId, { name: "Retry school", slug: ownerId })).resolves.toMatchObject({ ownerUserId: ownerId, slug: ownerId });
    expect(await db!.schoolMembership.count({ where: { userId: ownerId, status: "ACTIVE" } })).toBe(1);
    expect(await db!.schoolMembershipRole.count({ where: { membership: { userId: ownerId }, role: "OWNER" } })).toBe(1);
  });
});
