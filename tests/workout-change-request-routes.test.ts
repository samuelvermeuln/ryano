import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  school: vi.fn(),
  membershipFirst: vi.fn(),
  roles: vi.fn(),
  assignment: vi.fn(),
  coachProfile: vi.fn(),
  requestFindFirst: vi.fn(),
  requestFindUnique: vi.fn(),
  requestCreate: vi.fn(),
  requestUpdate: vi.fn(),
  requestFindMany: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));
const { client } = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => {
  Object.assign(client, {
    school: { findUnique: mocks.school },
    schoolMembership: { findFirst: mocks.membershipFirst },
    schoolMembershipRole: { findMany: mocks.roles },
    workoutAssignment: { findUnique: mocks.assignment },
    coachProfile: { findUnique: mocks.coachProfile },
    workoutChangeRequest: {
      findFirst: mocks.requestFindFirst,
      findUnique: mocks.requestFindUnique,
      findMany: mocks.requestFindMany,
      create: mocks.requestCreate,
      update: mocks.requestUpdate,
    },
    auditLog: { create: mocks.audit },
  });
  return { prisma: { ...client, $transaction: mocks.transaction } };
});

import { POST as postRequest, GET as listRequests } from "@/app/api/schools/[id]/workout-change-requests/route";
import { PATCH as decide } from "@/app/api/schools/[id]/workout-change-requests/[requestId]/route";

const now = new Date("2026-09-16T12:00:00Z");
const manager = {
  id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE",
  startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
};
const ownerRole = { id: "role", membershipId: "manager", role: "OWNER", createdAt: now };
const assignment = { id: "assignment", schoolId: "school", coachId: "coach" };
const openRequest = {
  id: "request", schoolId: "school", workoutAssignmentId: "assignment", coachId: "coach",
  requestedBy: "owner", reason: "ajustar ritmo", status: "PENDING",
  resolvedBy: null, resolvedAt: null, resolutionNote: null, createdAt: now, updatedAt: now,
};

const listContext = { params: Promise.resolve({ id: "school" }) };
const itemContext = { params: Promise.resolve({ id: "school", requestId: "request" }) };
const createBody = JSON.stringify({ workoutAssignmentId: "assignment", reason: "ajustar ritmo" });

const postReq = (body = createBody) =>
  postRequest(new Request("http://localhost/api/schools/school/workout-change-requests", { method: "POST", body }), listContext);
const patchReq = (body: string) =>
  decide(new Request("http://localhost/api/schools/school/workout-change-requests/request", { method: "PATCH", body }), itemContext);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.school.mockResolvedValue({ id: "school", status: "ACTIVE" });
  mocks.membershipFirst.mockResolvedValue(manager);
  mocks.roles.mockResolvedValue([ownerRole]);
  mocks.assignment.mockResolvedValue(assignment);
  mocks.coachProfile.mockResolvedValue({ userId: "coach-user" });
  mocks.requestFindFirst.mockResolvedValue(null);
  mocks.requestFindUnique.mockResolvedValue(openRequest);
  mocks.requestFindMany.mockResolvedValue([]);
  mocks.requestCreate.mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data));
  mocks.requestUpdate.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ ...openRequest, ...(data as object) }));
  mocks.audit.mockResolvedValue({});
  mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(client));
});

it("opens a request against a prescription of this school", async () => {
  const response = await postReq();
  expect(response.status).toBe(201);
  expect(mocks.requestCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      schoolId: "school", coachId: "coach", requestedBy: "owner", status: "PENDING",
    }),
  }));
});

it("refuses a prescription that belongs to another school", async () => {
  mocks.assignment.mockResolvedValue({ ...assignment, schoolId: "other-school" });
  const response = await postReq();
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "WORKOUT_ASSIGNMENT_NOT_FOUND" });
  expect(mocks.requestCreate).not.toHaveBeenCalled();
});

it("refuses a prescription with no coach to answer", async () => {
  mocks.assignment.mockResolvedValue({ ...assignment, coachId: null });
  const response = await postReq();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "WORKOUT_CHANGE_REQUEST_NO_COACH" });
  expect(mocks.requestCreate).not.toHaveBeenCalled();
});

it("refuses a second open request for the same prescription", async () => {
  mocks.requestFindFirst.mockResolvedValue({ id: "existing" });
  const response = await postReq();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "WORKOUT_CHANGE_REQUEST_ALREADY_OPEN" });
  expect(mocks.requestCreate).not.toHaveBeenCalled();
});

it("rejects a caller who cannot manage members", async () => {
  mocks.membershipFirst.mockResolvedValue(null);
  const response = await postReq();
  expect(response.status).toBe(403);
  expect(mocks.requestCreate).not.toHaveBeenCalled();
});

it("rejects an anonymous caller before touching the database", async () => {
  mocks.auth.mockResolvedValue(null);
  const response = await postReq();
  expect(response.status).toBe(401);
  expect(mocks.school).not.toHaveBeenCalled();
});

it.each([
  { name: "empty reason", body: JSON.stringify({ workoutAssignmentId: "assignment", reason: "  " }) },
  { name: "missing assignment", body: JSON.stringify({ reason: "ajustar" }) },
  { name: "unknown field", body: JSON.stringify({ workoutAssignmentId: "a", reason: "r", priority: "HIGH" }) },
])("rejects $name", async ({ body }) => {
  const response = await postReq(body);
  expect(response.status).toBe(400);
  expect(mocks.requestCreate).not.toHaveBeenCalled();
});

it.each(["ACKNOWLEDGED", "RESOLVED", "DECLINED"])(
  "lets the responsible coach answer with %s",
  async (status) => {
    mocks.auth.mockResolvedValue({ user: { id: "coach-user" } });
    const response = await patchReq(JSON.stringify({ status }));
    expect(response.status).toBe(200);
    expect(mocks.requestUpdate).toHaveBeenCalled();
  },
);

it.each(["ACKNOWLEDGED", "RESOLVED", "DECLINED"])(
  "stops school administration from answering %s on the coach's behalf",
  async (status) => {
    const response = await patchReq(JSON.stringify({ status }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.requestUpdate).not.toHaveBeenCalled();
  },
);

it("lets administration withdraw its own request", async () => {
  const response = await patchReq(JSON.stringify({ status: "CANCELLED" }));
  expect(response.status).toBe(200);
  expect(mocks.requestUpdate).toHaveBeenCalled();
});

it("stops a non-manager, non-coach from withdrawing a request", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "stranger" } });
  mocks.membershipFirst.mockResolvedValue(null);
  const response = await patchReq(JSON.stringify({ status: "CANCELLED" }));
  expect(response.status).toBe(403);
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("refuses to decide a request stored under another school", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "coach-user" } });
  mocks.requestFindUnique.mockResolvedValue({ ...openRequest, schoolId: "other-school" });
  const response = await patchReq(JSON.stringify({ status: "RESOLVED" }));
  expect(response.status).toBe(404);
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("refuses to re-decide a closed request", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "coach-user" } });
  mocks.requestFindUnique.mockResolvedValue({
    ...openRequest, status: "RESOLVED", resolvedBy: "coach-user", resolvedAt: now,
  });
  const response = await patchReq(JSON.stringify({ status: "DECLINED" }));
  expect(response.status).toBe(409);
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("rejects a status outside the decision vocabulary", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "coach-user" } });
  const response = await patchReq(JSON.stringify({ status: "PENDING" }));
  expect(response.status).toBe(400);
  expect(mocks.requestUpdate).not.toHaveBeenCalled();
});

it("scopes the listing to the school in the URL", async () => {
  const response = await listRequests(
    new Request("http://localhost/api/schools/school/workout-change-requests"),
    listContext,
  );
  expect(response.status).toBe(200);
  expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ schoolId: "school" }),
  }));
});

it("hides the listing behind the feature flag", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  const response = await listRequests(
    new Request("http://localhost/api/schools/school/workout-change-requests"),
    listContext,
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
});
