import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" },
  school: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  schoolMembership: { findFirst: vi.fn(), updateMany: vi.fn() },
  schoolMembershipRole: { findMany: vi.fn() },
  schoolAthleteMembership: { findFirst: vi.fn(), updateMany: vi.fn() },
  coachSchoolMembership: { findFirst: vi.fn(), updateMany: vi.fn() },
  coachAthleteAssignment: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/db", () => ({ prisma: mocks }));

import { GET, PATCH } from "@/app/api/schools/[id]/route";
import { POST as deactivate } from "@/app/api/schools/[id]/deactivate/route";
import { POST as reactivate } from "@/app/api/schools/[id]/reactivate/route";
import { GET as lobby } from "@/app/api/schools/[id]/lobby/route";
import { POST as bulk } from "@/app/api/schools/[id]/coach-assignments/bulk/route";

const context = { params: Promise.resolve({ id: "school" }) };
const request = (method: string, body?: unknown) => new Request("http://localhost/api/schools/school", {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const management = {
  patch: () => PATCH(request("PATCH", { name: "Updated" }), context),
  lobby: () => lobby(request("GET"), context),
  bulk: () => bulk(request("POST", { coachId: "coach", athleteIds: ["athlete"] }), context),
};
const school = { id: "school", ownerUserId: "owner", status: "ACTIVE", name: "School" };
const membership = { id: "manager", schoolId: "school", userId: "actor", status: "ACTIVE", endedAt: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "actor", role: "USER" } });
  mocks.school.findUnique.mockResolvedValue(school);
  mocks.school.findUniqueOrThrow.mockResolvedValue({ ...school, status: "INACTIVE" });
  mocks.school.update.mockImplementation(async ({ data }) => ({ ...school, ...data }));
  mocks.schoolMembership.findFirst.mockResolvedValue(membership);
  mocks.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role: "ADMIN" }]);
  mocks.schoolAthleteMembership.findFirst.mockResolvedValue({ id: "athlete-period" });
  mocks.coachSchoolMembership.findFirst.mockResolvedValue({ id: "coach-period" });
  mocks.coachAthleteAssignment.findFirst.mockResolvedValue(null);
  mocks.coachAthleteAssignment.create.mockImplementation(async ({ data }) => data);
  mocks.$transaction.mockImplementation(async (run) => run(mocks));
  mocks.$queryRaw.mockResolvedValue([]);
});

describe("School endpoint policy integration [T034]", () => {
  it.each(Object.entries(management))("allows a local ADMIN through %s without property ownership", async (_name, operation) => {
    expect((await operation()).status).toBe(_name === "bulk" ? 201 : 200);
    expect(mocks.schoolMembership.findFirst).toHaveBeenCalledWith({
      where: { schoolId: "school", userId: "actor", status: "ACTIVE" },
    });
  });

  it.each(["COACH", "ATHLETE"])("denies global ADMIN with only local %s before operational access", async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: "actor", role: "ADMIN" } });
    mocks.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role }]);
    for (const operation of Object.values(management)) expect((await operation()).status).toBe(403);
    expect(mocks.school.update).not.toHaveBeenCalled();
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });

  it.each([
    null, { ...membership, status: "PENDING" }, { ...membership, endedAt: new Date() },
    { ...membership, schoolId: "other-school" }, { ...membership, userId: "other-user" },
  ])("denies missing, revoked or mismatched memberships %j", async (row) => {
    mocks.schoolMembership.findFirst.mockResolvedValue(row);
    for (const operation of Object.values(management)) expect((await operation()).status).toBe(403);
    expect(mocks.school.update).not.toHaveBeenCalled();
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });

  it("does not let property ownership bypass a missing active local membership", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    mocks.schoolMembership.findFirst.mockResolvedValue(null);
    for (const operation of [...Object.values(management), () => deactivate(request("POST"), context)]) {
      expect((await operation()).status).toBe(403);
    }
    expect(mocks.school.updateMany).not.toHaveBeenCalled();
    expect(mocks.schoolMembership.updateMany).not.toHaveBeenCalled();
  });

  it("requires OWNER for deactivation and checks the policy before ending periods", async () => {
    expect((await deactivate(request("POST"), context)).status).toBe(403);
    expect(mocks.schoolMembership.updateMany).not.toHaveBeenCalled();
    mocks.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role: "OWNER" }]);
    expect((await deactivate(request("POST"), context)).status).toBe(200);
    expect(mocks.schoolMembership.updateMany).toHaveBeenCalledOnce();
    expect(mocks.coachAthleteAssignment.updateMany).toHaveBeenCalledOnce();
  });

  it("preserves read-only inactive retries and owner reactivation without reopening memberships", async () => {
    const inactive = { ...school, status: "INACTIVE", deactivatedAt: "2026-09-14T12:00:00Z" };
    mocks.school.findUnique.mockResolvedValue(inactive);
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    mocks.schoolMembership.findFirst.mockResolvedValue(null);
    expect(await (await deactivate(request("POST"), context)).json()).toEqual(inactive);
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect((await reactivate(request("POST"), context)).status).toBe(200);
    expect(mocks.schoolMembership.updateMany).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ user: { id: "actor", role: "ADMIN" } });
    expect((await reactivate(request("POST"), context)).status).toBe(403);
    expect((await deactivate(request("POST"), context)).status).toBe(403);
  });

  it("keeps school discovery readable by an authenticated non-manager", async () => {
    mocks.schoolMembership.findFirst.mockResolvedValue(null);
    expect((await GET(request("GET"), context)).status).toBe(200);
  });

  it("gates disabled and unauthenticated calls before policy persistence", async () => {
    for (const operation of [...Object.values(management), () => deactivate(request("POST"), context)]) {
      mocks.env.SCHOOL_MODULE_ENABLED = "false";
      expect((await operation()).status).toBe(404);
      mocks.env.SCHOOL_MODULE_ENABLED = "true";
      mocks.auth.mockResolvedValue(null);
      expect((await operation()).status).toBe(401);
    }
    expect(mocks.schoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it("hides policy storage failures without performing mutations", async () => {
    mocks.schoolMembership.findFirst.mockRejectedValue(new Error("private connection details"));
    for (const operation of [...Object.values(management), () => deactivate(request("POST"), context)]) {
      const response = await operation();
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    }
    expect(mocks.school.update).not.toHaveBeenCalled();
    expect(mocks.schoolMembership.updateMany).not.toHaveBeenCalled();
    expect(mocks.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });
});
