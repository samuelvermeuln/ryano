import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), school: vi.fn(), user: vi.fn(), first: vi.fn(), unique: vi.fn(),
  list: vi.fn(), roles: vi.fn(), create: vi.fn(), addRole: vi.fn(), update: vi.fn(),
  transaction: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {
  school: { findUnique: mocks.school }, user: { findUnique: mocks.user },
  schoolMembership: {
    findFirst: mocks.first, findUnique: mocks.unique, findMany: mocks.list,
    create: mocks.create, update: mocks.update,
  },
  schoolMembershipRole: { findMany: mocks.roles, create: mocks.addRole },
  $transaction: mocks.transaction,
} }));

import { prisma } from "@/server/db";
import { GET, POST } from "@/app/api/schools/[id]/members/route";
import { DELETE } from "@/app/api/schools/[id]/members/[membershipId]/route";

const now = new Date("2026-09-01T12:00:00.000Z");
const context = { params: Promise.resolve({ id: "school" }) };
const memberContext = { params: Promise.resolve({ id: "school", membershipId: "member" }) };
const membership = {
  id: "member", schoolId: "school", userId: "athlete", status: "ACTIVE",
  startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
};
const actorMembership = { ...membership, id: "manager", userId: "owner" };
const role = { id: "role", membershipId: "manager", role: "OWNER", createdAt: now };
const request = (method = "GET", body?: string, query = "") => new Request(
  `http://localhost/api/schools/school/members${query}`,
  { method, ...(body === undefined ? {} : { body }) },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "owner", status: "ACTIVE" });
  mocks.user.mockResolvedValue({ status: "ACTIVE" });
  mocks.first.mockImplementation(async ({ where }) => where.userId === "owner" ? actorMembership : null);
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [role] : []);
  mocks.unique.mockResolvedValue(membership);
  mocks.list.mockResolvedValue([]);
  mocks.create.mockImplementation(async ({ data }) => data);
  mocks.addRole.mockImplementation(async ({ data }) => data);
  mocks.update.mockImplementation(async ({ data }) => ({ ...membership, ...data }));
  mocks.transaction.mockImplementation(async (operation) => operation(prisma));
});

const operations = [
  () => GET(request(), context),
  () => POST(request("POST", JSON.stringify({ userId: "athlete", roles: ["ATHLETE"] })), context),
  () => DELETE(request("DELETE"), memberContext),
];

it.each([
  { name: "owner without local period", row: null },
  { name: "pending owner period", row: { ...actorMembership, status: "PENDING" } },
  { name: "ended owner period", row: { ...actorMembership, status: "ENDED" } },
  { name: "membership from another school", row: { ...actorMembership, schoolId: "other" } },
  { name: "membership of another user", row: { ...actorMembership, userId: "other" } },
])("denies $name before member access or writes [T038]", async ({ row }) => {
  mocks.first.mockResolvedValue(row);
  for (const operation of operations) {
    const response = await operation();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
  }
  expect(mocks.roles).not.toHaveBeenCalled();
  expect(mocks.unique).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.addRole).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([
  { name: "COACH", roles: [{ ...role, role: "COACH" }] },
  { name: "ATHLETE", roles: [{ ...role, role: "ATHLETE" }] },
  { name: "no roles", roles: [] },
  { name: "OWNER on another membership", roles: [{ ...role, membershipId: "other" }] },
  { name: "ADMIN on another membership", roles: [{ ...role, membershipId: "other", role: "ADMIN" }] },
])("denies global ADMIN with $name before member access or writes [T038]", async ({ roles }) => {
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "ADMIN" } });
  mocks.roles.mockResolvedValue(roles);
  for (const operation of operations) expect((await operation()).status).toBe(403);
  expect(mocks.unique).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.addRole).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("gates operation %i by feature flag and authentication [T035]", async (index) => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  expect((await operations[index]()).status).toBe(404);
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue(null);
  expect((await operations[index]()).status).toBe(401);
  expect(mocks.school).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("denies global ADMIN without local membership for operation %i [T035]", async (index) => {
  mocks.auth.mockResolvedValue({ user: { id: "outsider", role: "ADMIN" } });
  expect((await operations[index]()).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("denies closed manager periods for operation %i [T035]", async (index) => {
  mocks.first.mockResolvedValue({ ...actorMembership, endedAt: now });
  expect((await operations[index]()).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("permits local ADMIN for operation %i [T035]", async (index) => {
  mocks.roles.mockImplementation(async ({ where }) => where.membershipId === "manager" ? [{ ...role, role: "ADMIN" }] : []);
  expect((await operations[index]()).status).toBe(index === 1 ? 201 : 200);
});

it("lists temporal periods with roles, stable cursor and ISO dates [T035]", async () => {
  mocks.list.mockResolvedValueOnce([membership, { ...membership, id: "member-z" }]).mockResolvedValueOnce([]);
  const response = await GET(request("GET", undefined, "?limit=1"), context);
  expect(response.status).toBe(200);
  const page = await response.json();
  expect(page.items).toEqual([{ ...membership, startedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(), roles: [] }]);
  expect(page.nextCursor).toEqual(expect.any(String));
  await GET(request("GET", undefined, `?limit=1&cursor=${page.nextCursor}`), context);
  expect(mocks.list).toHaveBeenLastCalledWith({ where: { schoolId: "school", id: { gt: "member" } }, orderBy: { id: "asc" }, take: 2 });
});

it.each(["limit=0", "limit=101", "limit=1.5", "cursor=broken", "cursor=", "userId=outsider"])(
  "rejects invalid pagination %s [T035]", async (query) => {
    const response = await GET(request("GET", undefined, `?${query}`), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.list).not.toHaveBeenCalled();
  },
);

it("creates a new effective period with roles atomically [T035]", async () => {
  const response = await operations[1]();
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ schoolId: "school", userId: "athlete", status: "ACTIVE", endedAt: null, roles: [{ role: "ATHLETE" }] });
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.addRole).toHaveBeenCalledOnce();
});

it.each(["{", "{}", '{"userId":"athlete","roles":["ATHLETE","ATHLETE"]}', '{"userId":"athlete","roles":["ATHLETE"],"actorId":"owner"}'])(
  "rejects invalid admission body %s [T035]", async (body) => {
    expect((await POST(request("POST", body), context)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);

it("rejects duplicate open periods and inactive schools [T035]", async () => {
  mocks.first.mockImplementation(async ({ where }) => where.userId === "owner" ? actorMembership : membership);
  expect((await operations[1]()).status).toBe(409);
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "owner", status: "INACTIVE" });
  expect((await operations[1]()).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("ends the period with optimistic concurrency and retains history [T035]", async () => {
  const response = await operations[2]();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: "member", status: "ENDED", startedAt: now.toISOString(), endedAt: expect.any(String) });
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: "member", status: "ACTIVE", updatedAt: now },
    data: { status: "ENDED", startedAt: now, endedAt: expect.any(Date), updatedAt: expect.any(Date) },
  });
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});

it("isolates removal by school and protects the proprietor [T035]", async () => {
  mocks.unique.mockResolvedValue({ ...membership, schoolId: "other" });
  expect((await operations[2]()).status).toBe(404);
  mocks.unique.mockResolvedValue({ ...membership, userId: "owner" });
  expect((await operations[2]()).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects removal payloads and already ended periods [T035]", async () => {
  expect((await DELETE(request("DELETE", '{"schoolId":"other"}'), memberContext)).status).toBe(400);
  mocks.unique.mockResolvedValue({ ...membership, status: "ENDED", endedAt: now });
  expect((await operations[2]()).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("returns safe missing-school and persistence errors for operation %i [T035]", async (index) => {
  mocks.school.mockResolvedValue(null);
  const absent = await operations[index]();
  expect(absent.status).toBe(404);
  expect(await absent.json()).toMatchObject({ code: "SCHOOL_NOT_FOUND" });
  mocks.school.mockRejectedValue(new Error("private database details"));
  const failure = await operations[index]();
  expect(failure.status).toBe(500);
  expect(await failure.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
});
