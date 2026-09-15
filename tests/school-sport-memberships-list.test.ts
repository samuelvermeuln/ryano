import type { PrismaClient } from "@prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ListSchoolSportMemberships } from "@/modules/school/application/list-school-sport-memberships";

const school = vi.fn();
const membership = vi.fn();
const roles = vi.fn();
const coaches = vi.fn();
const athletes = vi.fn();
const db = {
  school: { findUnique: school },
  schoolMembership: { findFirst: membership },
  schoolMembershipRole: { findMany: roles },
  coachSchoolMembership: { findMany: coaches },
  schoolAthleteMembership: { findMany: athletes },
} as unknown as PrismaClient;
const useCase = new ListSchoolSportMemberships(db);
const now = new Date("2026-09-14T00:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  school.mockResolvedValue({ id: "school" });
  membership.mockResolvedValue({ id: "manager", schoolId: "school", userId: "actor", status: "ACTIVE", startedAt: now, endedAt: null, createdAt: now, updatedAt: now });
  roles.mockResolvedValue([{ id: "role", membershipId: "manager", role: "ADMIN", createdAt: now }]);
  coaches.mockResolvedValue([]);
  athletes.mockResolvedValue([]);
});

it.each(["coaches", "athletes"] as const)("lists %s temporal periods only after local management authorization [T058]", async (kind) => {
  expect(await useCase.execute("actor", "school", kind, { limit: "5" })).toEqual({ items: [], nextCursor: null });
  expect(kind === "coaches" ? coaches : athletes).toHaveBeenCalledWith({ where: { schoolId: "school" }, orderBy: { id: "asc" }, take: 6 });
  expect(kind === "coaches" ? athletes : coaches).not.toHaveBeenCalled();
});

it.each(["coaches", "athletes"] as const)("denies %s reads without a local active management role [T058]", async (kind) => {
  for (const row of [null, { id: "manager", schoolId: "school", userId: "actor", status: "PENDING", startedAt: null, endedAt: null, createdAt: now, updatedAt: now }]) {
    membership.mockResolvedValue(row);
    await expect(useCase.execute("actor", "school", kind)).rejects.toMatchObject({ status: 403 });
  }
  expect(coaches).not.toHaveBeenCalled();
  expect(athletes).not.toHaveBeenCalled();
});

it.each([{ limit: 0 }, { limit: 101 }, { cursor: "broken" }, { cursor: "%%%" }, { actorId: "other" }])("rejects invalid list options %j [T058]", async (options) => {
  await expect(useCase.execute("actor", "school", "athletes", options)).rejects.toThrow();
  expect(school).not.toHaveBeenCalled();
  expect(athletes).not.toHaveBeenCalled();
});

it("handles absent actor/school and delegates validated opaque pagination [T058]", async () => {
  await expect(useCase.execute(null, "school", "coaches")).rejects.toMatchObject({ status: 401 });
  school.mockResolvedValue(null);
  await expect(useCase.execute("actor", "school", "coaches")).rejects.toMatchObject({ status: 404 });
  school.mockResolvedValue({ id: "school" });
  const cursor = Buffer.from(JSON.stringify({ id: "period" })).toString("base64url");
  await useCase.execute("actor", "school", "athletes", { cursor });
  expect(athletes).toHaveBeenCalledWith({ where: { schoolId: "school", id: { gt: "period" } }, orderBy: { id: "asc" }, take: 21 });
});
