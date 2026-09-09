import type { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MembershipStatus, SchoolRole } from "@/modules/school/domain/enums";
import { createSchoolMembership, transitionSchoolMembership } from "@/modules/school/domain/school-membership";
import { createSchoolMembershipRole } from "@/modules/school/domain/school-membership-role";
import { SchoolMembershipRepository } from "@/modules/school/infrastructure/school-membership-repository";

const now = new Date("2026-09-09T10:00:00Z");
const later = new Date("2026-09-10T10:00:00Z");
const pending = () => createSchoolMembership({ id: "period-1", schoolId: "school-1", userId: "user-1" }, now);
function setup() {
  const db = {
    schoolMembership: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    schoolMembershipRole: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  };
  const repo = new SchoolMembershipRepository(db as unknown as Pick<PrismaClient, "schoolMembership" | "schoolMembershipRole">);
  return { db, repo };
}

describe("SchoolMembershipRepository [T025]", () => {
  it("accepts a transaction client without owning the transaction", () => {
    const tx = {} as Prisma.TransactionClient;
    expect(new SchoolMembershipRepository(tx)).toBeInstanceOf(SchoolMembershipRepository);
  });

  it("persists a validated period and preserves database conflicts", async () => {
    const { db, repo } = setup();
    const period = pending();
    db.schoolMembership.create.mockResolvedValue(period);
    expect(await repo.create(period)).toEqual(period);
    expect(db.schoolMembership.create).toHaveBeenCalledWith({ data: period });
    const conflict = Object.assign(new Error("duplicate"), { code: "P2002" });
    db.schoolMembership.create.mockRejectedValue(conflict);
    await expect(repo.create(period)).rejects.toBe(conflict);
    db.schoolMembership.create.mockClear();
    await expect(repo.create({ ...period, status: MembershipStatus.ACTIVE })).rejects.toThrow();
    expect(db.schoolMembership.create).not.toHaveBeenCalled();
  });

  it("looks up a specific period or only the active school/user period", async () => {
    const { db, repo } = setup();
    db.schoolMembership.findUnique.mockResolvedValue(null);
    expect(await repo.findById("absent")).toBeNull();
    expect(db.schoolMembership.findUnique).toHaveBeenCalledWith({ where: { id: "absent" } });
    db.schoolMembership.findFirst.mockResolvedValue(null);
    expect(await repo.findActiveBySchoolAndUser("school-1", "user-1")).toBeNull();
    expect(db.schoolMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school-1", userId: "user-1", status: MembershipStatus.ACTIVE } });
  });

  it.each(["listBySchool", "listByUser"] as const)("%s includes historical periods and pages without overlap", async (method) => {
    const { db, repo } = setup();
    const rows = [pending(), { ...pending(), id: "period-2", status: MembershipStatus.REJECTED, endedAt: now }];
    db.schoolMembership.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[1]]);
    const first = await repo[method]("scope-1", { limit: 1 });
    expect(first.items).toEqual([rows[0]]);
    expect(first.nextCursor).toBeTruthy();
    const second = await repo[method]("scope-1", { limit: 1, cursor: first.nextCursor! });
    expect(second).toEqual({ items: [rows[1]], nextCursor: null });
    const scope = method === "listBySchool" ? { schoolId: "scope-1" } : { userId: "scope-1" };
    expect(db.schoolMembership.findMany).toHaveBeenNthCalledWith(1, { where: scope, orderBy: { id: "asc" }, take: 2 });
    expect(db.schoolMembership.findMany).toHaveBeenNthCalledWith(2, { where: { ...scope, id: { gt: "period-1" } }, orderBy: { id: "asc" }, take: 2 });
    await expect(repo[method]("scope-1", { limit: 101 })).rejects.toThrow();
    await expect(repo[method]("scope-1", { cursor: "broken" })).rejects.toThrow();
  });

  it.each([MembershipStatus.ACTIVE, MembershipStatus.REJECTED])("transitions pending to %s using domain timestamps", async (status) => {
    const { db, repo } = setup();
    const period = pending();
    const transitioned = transitionSchoolMembership(period, status, later);
    db.schoolMembership.findUnique.mockResolvedValue(period);
    db.schoolMembership.update.mockResolvedValue(transitioned);
    expect(await repo.updateStatus(period.id, status, later)).toEqual(transitioned);
    expect(db.schoolMembership.update).toHaveBeenCalledWith({
      where: { id: period.id, status: period.status, updatedAt: period.updatedAt },
      data: { status, startedAt: transitioned.startedAt, endedAt: transitioned.endedAt, updatedAt: later },
    });
  });

  it.each([MembershipStatus.ENDED, MembershipStatus.REVOKED])("closes active periods as %s without overwriting their start", async (status) => {
    const { db, repo } = setup();
    const active = transitionSchoolMembership(pending(), MembershipStatus.ACTIVE, now);
    db.schoolMembership.findUnique.mockResolvedValue(active);
    await repo.updateStatus(active.id, status, later);
    expect(db.schoolMembership.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status, startedAt: now, endedAt: later, updatedAt: later } }));
  });

  it("rejects reopening and backwards time before writing, and leaves absent handling to use cases", async () => {
    const { db, repo } = setup();
    db.schoolMembership.findUnique.mockResolvedValue(transitionSchoolMembership(pending(), MembershipStatus.REJECTED, later));
    await expect(repo.updateStatus("period-1", MembershipStatus.ACTIVE, later)).rejects.toMatchObject({ code: "SCHOOL_MEMBERSHIP_INVALID_TRANSITION" });
    db.schoolMembership.findUnique.mockResolvedValue(pending());
    await expect(repo.updateStatus("period-1", MembershipStatus.ACTIVE, new Date("2026-09-08"))).rejects.toThrow();
    db.schoolMembership.findUnique.mockResolvedValue(null);
    expect(await repo.updateStatus("absent", MembershipStatus.ACTIVE, later)).toBeNull();
    expect(db.schoolMembership.update).not.toHaveBeenCalled();
  });

  it("propagates concurrent writes rather than overwriting a newer period state", async () => {
    const { db, repo } = setup();
    db.schoolMembership.findUnique.mockResolvedValue(pending());
    const stale = Object.assign(new Error("record changed"), { code: "P2025" });
    db.schoolMembership.update.mockRejectedValue(stale);
    await expect(repo.updateStatus("period-1", MembershipStatus.ACTIVE, later)).rejects.toBe(stale);
  });

  it("adds and removes only the selected role without deleting a membership", async () => {
    const { db, repo } = setup();
    const role = createSchoolMembershipRole({ id: "role-1", membershipId: "period-1", role: SchoolRole.COACH }, now);
    db.schoolMembershipRole.create.mockResolvedValue(role);
    expect(await repo.addRole(role)).toEqual(role);
    expect(db.schoolMembershipRole.create).toHaveBeenCalledWith({ data: role });
    const duplicate = Object.assign(new Error("duplicate"), { code: "P2002" });
    db.schoolMembershipRole.create.mockRejectedValue(duplicate);
    await expect(repo.addRole(role)).rejects.toBe(duplicate);
    db.schoolMembershipRole.findMany.mockResolvedValue([role]);
    expect(await repo.findRoles("period-1")).toEqual([role]);
    expect(db.schoolMembershipRole.findMany).toHaveBeenCalledWith({ where: { membershipId: "period-1" }, orderBy: { id: "asc" } });
    db.schoolMembershipRole.deleteMany.mockResolvedValue({ count: 1 });
    expect(await repo.removeRole("period-1", SchoolRole.COACH)).toBe(true);
    expect(db.schoolMembershipRole.deleteMany).toHaveBeenCalledWith({ where: { membershipId: "period-1", role: SchoolRole.COACH } });
    db.schoolMembershipRole.deleteMany.mockResolvedValue({ count: 0 });
    expect(await repo.removeRole("period-1", SchoolRole.COACH)).toBe(false);
    expect(db.schoolMembership.update).not.toHaveBeenCalled();
  });
});
