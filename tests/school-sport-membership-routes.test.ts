import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), execute: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/request-coach-school-membership", () => ({ RequestCoachSchoolMembership: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/request-school-membership", () => ({ RequestSchoolMembership: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/rejoin-school", () => ({ RejoinSchool: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/approve-coach-school-membership", () => ({ ApproveCoachSchoolMembership: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/reject-coach-school-membership", () => ({ RejectCoachSchoolMembership: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/remove-coach-from-school", () => ({ RemoveCoachFromSchool: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/approve-athlete-membership", () => ({ ApproveAthleteMembership: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/reject-athlete-membership", () => ({ RejectAthleteMembership: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/remove-athlete-from-school", () => ({ RemoveAthleteFromSchool: class { execute = mocks.execute; } }));
vi.mock("@/modules/school/application/list-school-sport-memberships", () => ({ ListSchoolSportMemberships: class { execute = mocks.execute; } }));

import { SchoolError } from "@/modules/school/domain/errors";
import { GET as coaches, POST as requestCoach } from "@/app/api/schools/[id]/coaches/route";
import { GET as athletes, POST as requestAthlete } from "@/app/api/schools/[id]/athletes/route";
import { POST as rejoin } from "@/app/api/schools/[id]/athletes/rejoin/route";
import { POST as approveCoach } from "@/app/api/schools/[id]/coaches/[membershipId]/approve/route";
import { POST as rejectCoach } from "@/app/api/schools/[id]/coaches/[membershipId]/reject/route";
import { DELETE as removeCoach } from "@/app/api/schools/[id]/coaches/[membershipId]/route";
import { POST as approveAthlete } from "@/app/api/schools/[id]/athletes/[membershipId]/approve/route";
import { POST as rejectAthlete } from "@/app/api/schools/[id]/athletes/[membershipId]/reject/route";
import { DELETE as removeAthlete } from "@/app/api/schools/[id]/athletes/[membershipId]/route";

const context = { params: Promise.resolve({ id: "school", membershipId: "period" }) };
const mutations = [requestCoach, requestAthlete, rejoin, approveCoach, rejectCoach, removeCoach, approveAthlete, rejectAthlete, removeAthlete];
const handlers = [...mutations, coaches, athletes];
const request = (body?: string) => new Request("http://localhost/api/schools/school/athletes?limit=10", { method: "POST", body });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "session-user" } });
  mocks.execute.mockResolvedValue({ id: "period", status: "PENDING" });
});

it.each(handlers.map((handler, index) => ({ handler, index })))("gates endpoint $index before use case execution [T058]", async ({ handler }) => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  expect((await handler(request(), context)).status).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue(null);
  expect((await handler(request(), context)).status).toBe(401);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each(mutations.map((handler, index) => ({ handler, index })))("delegates mutation $index with session identity and exact period [T058]", async ({ handler, index }) => {
  const response = await handler(request("{}"), context);
  expect(response.status).toBe(index < 3 ? 201 : 200);
  expect(mocks.execute).toHaveBeenCalledWith(...(index < 3 ? ["session-user", "school"] : ["session-user", "school", "period"]));
  expect(await response.json()).toEqual({ id: "period", status: "PENDING" });
});

it.each(mutations.map((handler, index) => ({ handler, index })))("rejects malformed or identity-overriding payloads on mutation $index [T058]", async ({ handler }) => {
  for (const body of ["{", "null", "[]", '{"actorId":"other"}', '{"membershipId":"other"}', '{"status":"ACTIVE"}']) {
    expect((await handler(request(body), context)).status).toBe(400);
  }
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each(handlers.map((handler, index) => ({ handler, index })))("preserves domain errors and hides infrastructure details on endpoint $index [T058]", async ({ handler }) => {
  for (const status of [403, 404, 409]) {
    mocks.execute.mockRejectedValue(new SchoolError("FORBIDDEN", "Operação indisponível.", status));
    expect((await handler(request(), context)).status).toBe(status);
  }
  mocks.execute.mockRejectedValue(new Error("private database credentials"));
  const response = await handler(request(), context);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
});

it.each([{ handler: coaches, kind: "coaches" }, { handler: athletes, kind: "athletes" }])("delegates $kind pagination [T058]", async ({ handler, kind }) => {
  mocks.execute.mockResolvedValue({ items: [], nextCursor: null });
  const response = await handler(request(), context);
  expect(mocks.execute).toHaveBeenCalledWith("session-user", "school", kind, { limit: "10" });
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});
