import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" } }));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));

import { GrantHistoryAccess } from "@/modules/school/application/grant-history-access";
import { ListHistoryGrants } from "@/modules/school/application/list-history-grants";
import { UpdateHistoryGrant } from "@/modules/school/application/update-history-grant";
import { RevokeHistoryAccess } from "@/modules/school/application/revoke-history-access";
import { SchoolError } from "@/modules/school/domain/errors";
import { createHistoryAccessGrant } from "@/modules/school/domain/history-access-grant";
import { GET as list, POST as create } from "@/app/api/history/grants/route";
import { PATCH as update, DELETE as revoke } from "@/app/api/history/grants/[grantId]/route";

const createOperation = vi.spyOn(GrantHistoryAccess.prototype, "execute");
const listOperation = vi.spyOn(ListHistoryGrants.prototype, "execute");
const updateOperation = vi.spyOn(UpdateHistoryGrant.prototype, "execute");
const revokeOperation = vi.spyOn(RevokeHistoryAccess.prototype, "execute");
const operations = [createOperation, listOperation, updateOperation, revokeOperation];
const scope = { activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false };
const body = { granteeType: "SCHOOL", granteeId: "school", scope };
const grant = createHistoryAccessGrant({
  ...body, granteeType: "SCHOOL", id: "grant", athleteId: "athlete", grantedBy: "athlete",
  schoolId: "school", coachId: null, fromDate: null, toDate: null,
}, new Date("2026-09-15T12:00:00Z"));
const context = { params: Promise.resolve({ grantId: "grant" }) };
const request = (method: string, value?: unknown, query = "") => new Request(`http://localhost/api/history/grants${query}`, {
  method, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
const allRoutes = () => [
  create(request("POST", body)), list(request("GET")),
  update(request("PATCH", { scope }), context), revoke(request("DELETE"), context),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "athlete" } });
  createOperation.mockResolvedValue(grant);
  listOperation.mockResolvedValue({ items: [grant], nextCursor: null });
  updateOperation.mockResolvedValue(grant);
  revokeOperation.mockResolvedValue({ ...grant, status: "REVOKED", revokedBy: "athlete", revokedAt: grant.updatedAt });
});

it("creates with session identity and UTC date DTOs, returning a private resource [T111]", async () => {
  const response = await create(request("POST", { ...body, fromDate: "2020-01-01" }));
  expect(response.status).toBe(201);
  expect(createOperation).toHaveBeenCalledWith("athlete", {
    ...body, fromDate: new Date("2020-01-01T00:00:00Z"), toDate: null,
  });
  expect(await response.json()).toMatchObject({ id: "grant", grantedAt: grant.grantedAt.toISOString() });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("lists consent for the session owner with pagination [T111]", async () => {
  const response = await list(request("GET", undefined, "?limit=2&cursor=last-grant"));
  expect(response.status).toBe(200);
  expect(listOperation).toHaveBeenCalledWith("athlete", { limit: 2, cursor: "last-grant" });
  expect(await response.json()).toMatchObject({ items: [{ id: "grant" }], nextCursor: null });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("updates by URL identity and revokes through the existing use cases [T111]", async () => {
  expect((await update(request("PATCH", { fromDate: null }), context)).status).toBe(200);
  expect(updateOperation).toHaveBeenCalledWith("athlete", { grantId: "grant", fromDate: null });
  const response = await revoke(request("DELETE"), context);
  expect(response.status).toBe(200);
  expect(revokeOperation).toHaveBeenCalledWith("athlete", { grantId: "grant" });
  expect(await response.json()).toMatchObject({ status: "REVOKED" });
  expect((await revoke(request("DELETE", {}), context)).status).toBe(200);
});

it("gates every endpoint before authentication and use cases [T111]", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  for (const response of await Promise.all(allRoutes())) {
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.auth).not.toHaveBeenCalled();
  for (const operation of operations) expect(operation).not.toHaveBeenCalled();
});

it("requires authentication for mutations and lists [T111]", async () => {
  mocks.auth.mockResolvedValue(null);
  for (const response of await Promise.all(allRoutes())) expect(response.status).toBe(401);
  for (const operation of operations) expect(operation).not.toHaveBeenCalled();
});

it.each([{ athleteId: "victim" }, { grantedBy: "victim" }, { scope: {} }, { fromDate: "2026-02-30" }])(
  "rejects invalid or impersonated creation %j [T111]", async (extra) => {
    expect((await create(request("POST", { ...body, ...extra }))).status).toBe(400);
    expect(createOperation).not.toHaveBeenCalled();
  },
);

it.each([{}, null, [], { scope, grantId: "other" }, { scope, athleteId: "victim" }, { granteeId: "other" }])(
  "rejects invalid update and path/owner overrides %j [T111]", async (patch) => {
    expect((await update(request("PATCH", patch), context)).status).toBe(400);
    expect(updateOperation).not.toHaveBeenCalled();
  },
);

it("rejects malformed JSON, delete payloads and malformed path IDs [T111]", async () => {
  expect((await create(new Request("http://localhost/api/history/grants", { method: "POST", body: "{" }))).status).toBe(400);
  expect((await revoke(request("DELETE", { grantId: "other" }), context)).status).toBe(400);
  expect((await revoke(request("DELETE"), { params: Promise.resolve({ grantId: "" }) })).status).toBe(400);
  expect(createOperation).not.toHaveBeenCalled();
  expect(revokeOperation).not.toHaveBeenCalled();
});

it.each(["?athleteId=victim", "?limit=101", "?limit=0", "?cursor="])(
  "rejects invalid list query %s before delegation [T111]", async (query) => {
    expect((await list(request("GET", undefined, query))).status).toBe(400);
    expect(listOperation).not.toHaveBeenCalled();
  },
);

it.each([["FORBIDDEN", 403], ["HISTORY_GRANT_NOT_FOUND", 404], ["HISTORY_GRANT_NOT_ACTIVE", 409]] as const)(
  "preserves domain error %s on update and revoke [T111]", async (code, status) => {
    const error = new SchoolError(code, "Permissão indisponível.", status);
    updateOperation.mockRejectedValue(error);
    revokeOperation.mockRejectedValue(error);
    for (const response of [await update(request("PATCH", { scope }), context), await revoke(request("DELETE"), context)]) {
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code, message: "Permissão indisponível." });
    }
  },
);

it("masks unexpected failures and keeps all error responses private [T111]", async () => {
  for (const operation of operations) operation.mockRejectedValue(new Error("private database details"));
  for (const response of await Promise.all(allRoutes())) {
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
});
