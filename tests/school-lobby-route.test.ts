import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), findMembership: vi.fn(), findRoles: vi.fn(), query: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" } }));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {
  school: { findUnique: mocks.findUnique },
  schoolMembership: { findFirst: mocks.findMembership },
  schoolMembershipRole: { findMany: mocks.findRoles },
  $queryRaw: mocks.query,
} }));
import { GET } from "@/app/api/schools/[id]/lobby/route";
const context = { params: Promise.resolve({ id: "school" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.findUnique.mockResolvedValue({ ownerUserId: "owner" });
  mocks.findMembership.mockResolvedValue({ id: "owner-membership", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null });
  mocks.findRoles.mockResolvedValue([{ membershipId: "owner-membership", role: "OWNER" }]);
  mocks.query.mockResolvedValue([]);
});
it("returns the canonical paginated lobby envelope [T068]", async () => {
  const response = await GET(new Request("http://localhost/api/schools/school/lobby?limit=10"), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});
it("gates disabled and unauthenticated requests [T068]", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  expect((await GET(new Request("http://localhost/lobby"), context)).status).toBe(404);
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/lobby"), context)).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects outsiders and malformed pagination without querying athletes [T068]", async () => {
  mocks.findUnique.mockResolvedValue({ ownerUserId: "other" });
  mocks.findMembership.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/lobby"), context)).status).toBe(403);
  expect((await GET(new Request("http://localhost/lobby?limit=101"), context)).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("serializes lobby dates and carries the requested cursor into the next page [T068]", async () => {
  const enteredLobbyAt = new Date("2026-09-11T10:00:00.000Z");
  const first = { id: "membership-a", athleteId: "athlete-a", name: "Athlete A", enteredLobbyAt, lastCoachId: "coach-a" };
  const second = { ...first, id: "membership-b", athleteId: "athlete-b", name: null, lastCoachId: null };
  mocks.query.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]);

  const response = await GET(new Request("http://localhost/api/schools/school/lobby?limit=1"), context);
  expect(response.status).toBe(200);
  const page = await response.json();
  expect(page.items).toEqual([{ ...first, enteredLobbyAt: enteredLobbyAt.toISOString() }]);
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "school" }, select: { ownerUserId: true } });

  const next = await GET(new Request(`http://localhost/api/schools/school/lobby?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`), context);
  expect(next.status).toBe(200);
  expect(await next.json()).toEqual({ items: [{ ...second, enteredLobbyAt: enteredLobbyAt.toISOString() }], nextCursor: null });
  expect(mocks.query.mock.calls[1][0].values).toContain("membership-a");
  expect(mocks.query.mock.calls[1][0].values).toContainEqual(enteredLobbyAt);
});

it.each(["limit=0", "limit=1.5", "limit=abc", "cursor=", "cursor=broken", "ownerUserId=owner"])(
  "rejects invalid or unsupported pagination %s before querying athletes [T068]",
  async (query) => {
    const response = await GET(new Request(`http://localhost/api/schools/school/lobby?${query}`), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR", message: expect.any(String) });
    expect(mocks.query).not.toHaveBeenCalled();
  },
);

it("returns the school not found contract without querying athletes [T068]", async () => {
  mocks.findUnique.mockResolvedValue(null);
  const response = await GET(new Request("http://localhost/api/schools/school/lobby"), context);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "SCHOOL_NOT_FOUND", message: "Escola não encontrada." });
  expect(mocks.query).not.toHaveBeenCalled();
});

it("does not grant lobby access to a global administrator who does not own the school [T068]", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "global-admin", role: "ADMIN" } });
  const response = await GET(new Request("http://localhost/api/schools/school/lobby"), context);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.query).not.toHaveBeenCalled();
});

it.each(["ADMIN", "OWNER"])("allows an active school member with the %s school role [T068]", async (role) => {
  mocks.auth.mockResolvedValue({ user: { id: "school-manager", role: "USER" } });
  mocks.findMembership.mockResolvedValue({ id: "manager-membership", schoolId: "school", userId: "school-manager", status: "ACTIVE", endedAt: null });
  mocks.findRoles.mockResolvedValue([{ membershipId: "manager-membership", role }]);
  const response = await GET(new Request("http://localhost/api/schools/school/lobby"), context);
  expect(response.status).toBe(200);
  expect(mocks.findMembership).toHaveBeenCalledWith({
    where: { schoolId: "school", userId: "school-manager", status: "ACTIVE" },
  });
  expect(mocks.findRoles).toHaveBeenCalledWith({ where: { membershipId: "manager-membership" }, orderBy: { id: "asc" } });
  expect(mocks.query).toHaveBeenCalledOnce();
});

it.each([[], [{ role: "COACH" }], [{ role: "ATHLETE" }]])("denies an active membership without school management roles %j [T068]", async (...roles) => {
  mocks.auth.mockResolvedValue({ user: { id: "school-member", role: "ADMIN" } });
  mocks.findMembership.mockResolvedValue({ id: "member-membership" });
  mocks.findRoles.mockResolvedValue(roles);
  const response = await GET(new Request("http://localhost/api/schools/school/lobby"), context);
  expect(response.status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("returns a safe internal error when lobby persistence fails [T068]", async () => {
  mocks.query.mockRejectedValue(new Error("private database details"));
  const response = await GET(new Request("http://localhost/api/schools/school/lobby"), context);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
});
