import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), school: vi.fn(), first: vi.fn(), unique: vi.fn(), roles: vi.fn(),
  create: vi.fn(), remove: vi.fn(), otherOwner: vi.fn(), transaction: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {
  school: { findUnique: mocks.school },
  schoolMembership: { findFirst: mocks.first, findUnique: mocks.unique },
  schoolMembershipRole: { findMany: mocks.roles, create: mocks.create, deleteMany: mocks.remove, findFirst: mocks.otherOwner },
  $transaction: mocks.transaction,
} }));

import { prisma } from "@/server/db";
import { POST } from "@/app/api/schools/[id]/members/[membershipId]/roles/route";
import { DELETE } from "@/app/api/schools/[id]/members/[membershipId]/roles/[role]/route";

const now = new Date("2026-09-01T12:00:00Z");
const membership = { id: "member", schoolId: "school", userId: "athlete", status: "ACTIVE", startedAt: now, endedAt: null, createdAt: now, updatedAt: now };
const manager = { ...membership, id: "manager", userId: "owner" };
const role = (value: string, membershipId = "member") => ({ id: value, membershipId, role: value, createdAt: now });
const context = { params: Promise.resolve({ id: "school", membershipId: "member" }) };
const request = (method: string, body?: string) => new Request("http://localhost/api/schools/school/members/member/roles", { method, ...(body === undefined ? {} : { body }) });
const add = (body = '{"role":"COACH"}') => POST(request("POST", body), context);
const remove = (value = "COACH", body?: string) => DELETE(request("DELETE", body), { params: Promise.resolve({ id: "school", membershipId: "member", role: value }) });
const operations = [() => add(), () => remove()];

it.each([
  { name: "owner without local period", row: null },
  { name: "pending owner period", row: { ...manager, status: "PENDING" } },
  { name: "ended owner period", row: { ...manager, status: "ENDED" } },
  { name: "membership from another school", row: { ...manager, schoolId: "other" } },
  { name: "membership of another user", row: { ...manager, userId: "other" } },
])("denies $name before role target lookup or writes [T038]", async ({ row }) => {
  mocks.first.mockResolvedValue(row);
  for (const operation of operations) {
    const response = await operation();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
  }
  expect(mocks.roles).not.toHaveBeenCalled();
  expect(mocks.unique).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([
  { name: "COACH", roles: [role("COACH", "manager")] },
  { name: "ATHLETE", roles: [role("ATHLETE", "manager")] },
  { name: "no roles", roles: [] },
  { name: "OWNER on another membership", roles: [role("OWNER", "other")] },
  { name: "ADMIN on another membership", roles: [role("ADMIN", "other")] },
])("denies global ADMIN with $name before role target lookup or writes [T038]", async ({ roles }) => {
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "ADMIN" } });
  mocks.roles.mockResolvedValue(roles);
  for (const operation of operations) expect((await operation()).status).toBe(403);
  expect(mocks.unique).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "owner", status: "ACTIVE" });
  mocks.first.mockImplementation(async ({ where }) => where.userId === "owner" ? manager : null);
  mocks.unique.mockResolvedValue(membership);
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [role("OWNER", "manager")] : [role("ATHLETE"), role("COACH")]);
  mocks.create.mockImplementation(async ({ data }) => data);
  mocks.remove.mockResolvedValue({ count: 1 });
  mocks.otherOwner.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (operation) => operation(prisma));
});

it.each([0, 1])("gates operation %i before persistence [T036]", async (index) => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  expect((await operations[index]()).status).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue(null);
  expect((await operations[index]()).status).toBe(401);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([0, 1])("rejects global ADMIN and closed local periods in operation %i [T036]", async (index) => {
  mocks.auth.mockResolvedValue({ user: { id: "outsider", role: "ADMIN" } });
  expect((await operations[index]()).status).toBe(403);
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.first.mockResolvedValue({ ...manager, endedAt: now });
  expect((await operations[index]()).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("accumulates a role for local ADMIN and preserves existing roles [T036]", async () => {
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [role("ADMIN", "manager")] : [role("ATHLETE")]);
  const response = await add();
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ membershipId: "member", role: "COACH", createdAt: expect.any(String) });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

it("removes only the URL role and retains the membership [T036]", async () => {
  const response = await remove();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ membershipId: "member", role: "COACH", removed: true });
  expect(mocks.remove).toHaveBeenCalledWith({ where: { membershipId: "member", role: "COACH" } });
});

it.each([
  { initialRole: "ADMIN", additions: ["COACH"] },
  { initialRole: "OWNER", additions: ["ADMIN", "COACH"] },
])("accumulates $initialRole with $additions on one membership [T037]", async ({ initialRole, additions }) => {
  const initial = role(initialRole);
  const storedRoles = [initial];
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager"
    ? [role("OWNER", "manager")]
    : storedRoles.filter(({ membershipId }) => membershipId === where.membershipId));
  mocks.create.mockImplementation(async ({ data }) => {
    storedRoles.push(data);
    return data;
  });
  mocks.remove.mockImplementation(async ({ where }) => {
    const index = storedRoles.findIndex(({ membershipId, role: value }) =>
      membershipId === where.membershipId && value === where.role);
    if (index < 0) return { count: 0 };
    storedRoles.splice(index, 1);
    return { count: 1 };
  });

  for (const value of additions) {
    const response = await add(JSON.stringify({ role: value }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ membershipId: membership.id, role: value });
  }

  expect(storedRoles.map(({ role: value }) => value)).toEqual([initialRole, ...additions]);
  expect(storedRoles.every(({ membershipId }) => membershipId === membership.id)).toBe(true);
  expect(storedRoles[0]).toBe(initial);
  expect(mocks.create).toHaveBeenCalledTimes(additions.length);
  expect(mocks.remove).not.toHaveBeenCalled();

  const duplicate = await add();
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ code: "SCHOOL_MEMBERSHIP_ROLE_ALREADY_EXISTS" });
  expect(storedRoles.map(({ role: value }) => value)).toEqual([initialRole, ...additions]);
  expect(mocks.create).toHaveBeenCalledTimes(additions.length);

  expect((await remove("COACH")).status).toBe(200);
  expect(storedRoles.map(({ role: value }) => value)).toEqual([initialRole, ...additions.filter((value) => value !== "COACH")]);
  expect(storedRoles[0]).toBe(initial);
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: { membershipId: membership.id, role: "COACH" } });
});

it.each(["{", "{}", '{"role":"GLOBAL_ADMIN"}', '{"role":"COACH","actorId":"owner"}', '{"roles":["COACH"]}'])("rejects invalid POST body %s [T036]", async (body) => {
  expect((await add(body)).status).toBe(400);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("rejects invalid URL role and DELETE body overrides [T036]", async () => {
  expect((await remove("invalid")).status).toBe(400);
  expect((await remove("COACH", '{"role":"OWNER"}')).status).toBe(400);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([0, 1])("isolates target school and rejects ended members for operation %i [T036]", async (index) => {
  mocks.unique.mockResolvedValue({ ...membership, schoolId: "other" });
  expect((await operations[index]()).status).toBe(404);
  mocks.unique.mockResolvedValue({ ...membership, endedAt: now, status: "ENDED" });
  expect((await operations[index]()).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([0, 1])("protects proprietor against another local admin in operation %i [T036]", async (index) => {
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "proprietor", status: "ACTIVE" });
  mocks.unique.mockResolvedValue({ ...membership, userId: "proprietor" });
  expect((await operations[index]()).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("protects last OWNER and last membership role [T036]", async () => {
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [role("OWNER", "manager")] : [role("OWNER"), role("COACH")]);
  const response = await remove("OWNER");
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_LAST_OWNER" });
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [role("OWNER", "manager")] : [role("COACH")]);
  expect(await (await remove()).json()).toMatchObject({ code: "SCHOOL_MEMBERSHIP_LAST_ROLE" });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("reports duplicate roles and missing roles without mutation [T036]", async () => {
  expect(await (await add()).json()).toMatchObject({ code: "SCHOOL_MEMBERSHIP_ROLE_ALREADY_EXISTS" });
  expect(await (await remove("ADMIN")).json()).toMatchObject({ code: "SCHOOL_MEMBERSHIP_ROLE_NOT_FOUND" });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("allows removing OWNER only when another active owner remains [T036]", async () => {
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [role("OWNER", "manager")] : [role("OWNER"), role("COACH")]);
  mocks.otherOwner.mockResolvedValue({ id: "other-owner" });
  expect((await remove("OWNER")).status).toBe(200);
  expect(mocks.otherOwner).toHaveBeenCalledWith({
    where: { role: "OWNER", membershipId: { not: "member" }, membership: { schoolId: "school", status: "ACTIVE", endedAt: null } },
    select: { id: true },
  });
});

it.each([0, 1])("rejects inactive school for operation %i [T036]", async (index) => {
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "owner", status: "INACTIVE" });
  const response = await operations[index]();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_INACTIVE" });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([0, 1])("returns stable missing-school and safe internal errors for operation %i [T036]", async (index) => {
  mocks.school.mockResolvedValue(null);
  expect(await (await operations[index]()).json()).toMatchObject({ code: "SCHOOL_NOT_FOUND" });
  mocks.school.mockRejectedValue(new Error("private database details"));
  const response = await operations[index]();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
});
