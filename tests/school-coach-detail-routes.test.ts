import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  school: vi.fn(),
  managerMembership: vi.fn(),
  coachMembership: vi.fn(),
  coachProfile: vi.fn(),
  assignments: vi.fn(),
  assignmentCount: vi.fn(),
  groupBy: vi.fn(),
  session: vi.fn(),
  schoolMembershipFirst: vi.fn(),
  evaluations: vi.fn(),
  compliances: vi.fn(),
  changeRequestCount: vi.fn(),
  roles: vi.fn(),
  assignmentIds: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {
  school: { findUnique: mocks.school },
  schoolMembership: { findFirst: mocks.schoolMembershipFirst },
  schoolMembershipRole: { findMany: mocks.roles },
  coachSchoolMembership: { findUnique: mocks.coachMembership },
  coachProfile: { findUnique: mocks.coachProfile },
  coachAthleteAssignment: { findMany: mocks.assignments, count: mocks.assignmentCount },
  workoutAssignment: { findMany: mocks.assignmentIds, groupBy: mocks.groupBy },
  coachEvaluation: { findMany: mocks.evaluations },
  workoutCompliance: { findMany: mocks.compliances },
  workoutChangeRequest: { count: mocks.changeRequestCount },
  session: { findFirst: mocks.session },
} }));

import { GET as getDetail } from "@/app/api/schools/[id]/coaches/[membershipId]/route";
import { GET as getReport } from "@/app/api/schools/[id]/coaches/[membershipId]/report/route";

const now = new Date("2026-09-16T12:00:00Z");
const context = { params: Promise.resolve({ id: "school", membershipId: "coach-membership" }) };
const manager = {
  id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE",
  startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
  roles: [{ role: "OWNER" }],
};
const coachMembership = {
  id: "coach-membership", coachId: "coach", schoolId: "school", status: "ACTIVE",
  requestedAt: now, decidedAt: now, startedAt: now, endedAt: null,
};
const coachProfile = {
  id: "coach", userId: "coach-user", displayName: "Prof. Ana", bio: null,
  status: "ACTIVE", createdAt: now,
  user: {
    id: "coach-user", name: "Ana", email: "ana@example.com", image: null, status: "ACTIVE",
    profile: { phoneE164: "+5511987654321" },
    address: null,
  },
};

const detailRequest = () => new Request("http://localhost/api/schools/school/coaches/coach-membership");
const reportRequest = (query = "") =>
  new Request(`http://localhost/api/schools/school/coaches/coach-membership/report${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "owner" });
  mocks.schoolMembershipFirst.mockResolvedValue(manager);
  mocks.coachMembership.mockResolvedValue(coachMembership);
  mocks.coachProfile.mockResolvedValue(coachProfile);
  mocks.assignments.mockResolvedValue([]);
  mocks.assignmentCount.mockResolvedValue(3);
  mocks.groupBy.mockResolvedValue([]);
  mocks.assignmentIds.mockResolvedValue([]);
  mocks.evaluations.mockResolvedValue([]);
  mocks.compliances.mockResolvedValue([]);
  mocks.changeRequestCount.mockResolvedValue(0);
  mocks.session.mockResolvedValue(null);
  mocks.roles.mockResolvedValue([{ id: "role", membershipId: "manager", role: "OWNER", createdAt: now }]);
});

it("returns the coach detail for a manager", async () => {
  const response = await getDetail(detailRequest(), context);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.coach).toMatchObject({ id: "coach", displayName: "Prof. Ana" });
  expect(body.user).toMatchObject({ email: "ana@example.com", phoneE164: "+5511987654321" });
});

it("never exposes the CPF of the coach", async () => {
  const body = await (await getDetail(detailRequest(), context)).json();
  expect(JSON.stringify(body)).not.toMatch(/cpf/i);
});

it.each([
  { name: "detail", run: () => getDetail(detailRequest(), context) },
  { name: "report", run: () => getReport(reportRequest(), context) },
])("rejects an anonymous caller on $name", async ({ run }) => {
  mocks.auth.mockResolvedValue(null);
  const response = await run();
  expect(response.status).toBe(401);
  expect(mocks.coachMembership).not.toHaveBeenCalled();
});

it.each([
  { name: "detail", run: () => getDetail(detailRequest(), context) },
  { name: "report", run: () => getReport(reportRequest(), context) },
])("rejects a caller who cannot manage members on $name", async ({ run }) => {
  mocks.schoolMembershipFirst.mockResolvedValue(null);
  const response = await run();
  expect(response.status).toBe(403);
  expect(mocks.coachMembership).not.toHaveBeenCalled();
});

it.each([
  { name: "detail", run: () => getDetail(detailRequest(), context) },
  { name: "report", run: () => getReport(reportRequest(), context) },
])("refuses to read a coach membership of another school on $name", async ({ run }) => {
  mocks.coachMembership.mockResolvedValue({ ...coachMembership, schoolId: "other-school" });
  const response = await run();
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND" });
});

it("hides the module behind its feature flag", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  const response = await getDetail(detailRequest(), context);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
});

it("counts prescriptions per status instead of collapsing them into one score", async () => {
  mocks.groupBy.mockResolvedValue([
    { status: "COMPLETED", _count: { _all: 7 } },
    { status: "MISSED", _count: { _all: 2 } },
  ]);
  const body = await (await getReport(reportRequest(), context)).json();
  expect(body.prescriptions.byStatus).toMatchObject({ COMPLETED: 7, MISSED: 2, CANCELLED: 0 });
});

it("averages evaluation and compliance scores over the window", async () => {
  mocks.assignmentIds.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  mocks.evaluations.mockResolvedValue([{ overallScore: 80 }, { overallScore: 90 }]);
  mocks.compliances.mockResolvedValue([{ overallScore: 70 }, { overallScore: 75 }]);
  const body = await (await getReport(reportRequest(), context)).json();
  expect(body.evaluations).toMatchObject({ total: 2, averageScore: 85 });
  expect(body.compliance).toMatchObject({ measured: 2, averageScore: 73 });
});

it("reports a null average rather than zero when nothing was measured", async () => {
  const body = await (await getReport(reportRequest(), context)).json();
  expect(body.evaluations.averageScore).toBeNull();
  expect(body.compliance.averageScore).toBeNull();
});

it("honours the requested window length", async () => {
  const body = await (await getReport(reportRequest("?days=7"), context)).json();
  expect(body.window.days).toBe(7);
});

it.each(["0", "400", "abc"])("rejects an out-of-range window of %s days", async (days) => {
  const response = await getReport(reportRequest(`?days=${days}`), context);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
});
