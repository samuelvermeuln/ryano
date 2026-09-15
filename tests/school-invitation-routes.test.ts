import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" } }));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));

import { CreateInvitationLink, createInvitationLinkSchema } from "@/modules/school/application/create-invitation-link";
import { ResolveInvitationLink, resolveInvitationLinkSchema } from "@/modules/school/application/resolve-invitation-link";
import { AcceptInvitation } from "@/modules/school/application/accept-invitation";
import { RevokeInvitation } from "@/modules/school/application/revoke-invitation";
import { SchoolError } from "@/modules/school/domain/errors";
import { POST as create } from "@/app/api/invitations/route";
import { GET as resolve } from "@/app/api/invitations/[id]/route";
import { POST as accept } from "@/app/api/invitations/[id]/accept/route";
import { POST as revoke } from "@/app/api/invitations/[id]/revoke/route";
import { schoolResponse } from "@/app/api/schools/_shared";

const createOperation = vi.spyOn(CreateInvitationLink.prototype, "execute");
const resolveOperation = vi.spyOn(ResolveInvitationLink.prototype, "execute");
const acceptOperation = vi.spyOn(AcceptInvitation.prototype, "execute");
const revokeOperation = vi.spyOn(RevokeInvitation.prototype, "execute");
const context = { params: Promise.resolve({ id: "bearer-token" }) };
const request = (body?: unknown) => new Request("http://localhost/api/invitations", {
  method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const preview = {
  id: "invite", type: "SCHOOL" as const, schoolId: "school", coachId: null,
  requiresApproval: true, expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  maxUses: null, usedCount: 0, status: "ACTIVE" as const, revokedAt: null,
};
const managed = { ...preview, createdBy: "manager", createdAt: new Date(), updatedAt: new Date() };
const receipt = { id: "receipt", invitationId: "invite", result: "PENDING_APPROVAL" as const, usedAt: new Date() };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "session-user" } });
  createOperation.mockImplementation(async (_actor, raw) => {
    createInvitationLinkSchema.parse(raw);
    return { invitation: managed, token: "issued-once" };
  });
  resolveOperation.mockImplementation(async (raw) => {
    resolveInvitationLinkSchema.parse(raw);
    return preview;
  });
  acceptOperation.mockResolvedValue(receipt);
  revokeOperation.mockResolvedValue({ ...managed, status: "REVOKED", revokedAt: new Date() });
});

it("creates through the use case with the session actor and serializes dates [T090]", async () => {
  const body = { type: "SCHOOL", schoolId: "school" };
  const response = await create(request(body));
  expect(response.status).toBe(201);
  expect(createOperation).toHaveBeenCalledWith("session-user", body);
  expect(await response.json()).toMatchObject({ token: "issued-once", invitation: { expiresAt: preview.expiresAt.toISOString() } });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("resolves publicly without authenticating and returns the safe preview [T090]", async () => {
  mocks.auth.mockRejectedValue(new Error("auth must not be called"));
  const response = await resolve(new Request("http://localhost/api/invitations/bearer-token"), context);
  expect(response.status).toBe(200);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(resolveOperation).toHaveBeenCalledWith({ token: "bearer-token" });
  expect(await response.json()).toEqual({ ...preview, expiresAt: preview.expiresAt.toISOString() });
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});

it("accepts for the session user and revokes by invitation ID [T090]", async () => {
  const accepted = await accept(request(), context);
  expect(accepted.status).toBe(200);
  expect(acceptOperation).toHaveBeenCalledWith("session-user", { token: "bearer-token" });
  expect(await accepted.json()).toEqual({ ...receipt, usedAt: receipt.usedAt.toISOString() });
  const revoked = await revoke(request({}), { params: Promise.resolve({ id: "invite" }) });
  expect(revoked.status).toBe(200);
  expect(revokeOperation).toHaveBeenCalledWith("session-user", { invitationId: "invite" });
});

it("gates every operation before authentication or use-case execution [T090]", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  for (const response of [await create(request({})), await resolve(request(), context), await accept(request(), context), await revoke(request(), context)]) {
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
  }
  expect(mocks.auth).not.toHaveBeenCalled();
  for (const operation of [createOperation, resolveOperation, acceptOperation, revokeOperation]) expect(operation).not.toHaveBeenCalled();
});

it("requires a session on all mutations and preserves existing school wrapper authentication [T090]", async () => {
  mocks.auth.mockResolvedValue(null);
  const schoolOperation = vi.fn();
  for (const response of [await create(request({})), await accept(request(), context), await revoke(request(), context), await schoolResponse(schoolOperation)]) {
    expect(response.status).toBe(401);
  }
  for (const operation of [createOperation, acceptOperation, revokeOperation, schoolOperation]) expect(operation).not.toHaveBeenCalled();
});

it("rejects malformed JSON, actor injection and unexpected mutation bodies [T090]", async () => {
  expect((await create(new Request("http://localhost/api/invitations", { method: "POST", body: "{" }))).status).toBe(400);
  expect(createOperation).not.toHaveBeenCalled();
  expect((await create(request({ type: "SCHOOL", schoolId: "school", createdBy: "attacker" }))).status).toBe(400);
  expect((await accept(request({ athleteId: "victim" }), context)).status).toBe(400);
  expect((await revoke(request({ invitationId: "other" }), context)).status).toBe(400);
  expect(acceptOperation).not.toHaveBeenCalled();
  expect(revokeOperation).not.toHaveBeenCalled();
});

it.each([
  ["INVITATION_NOT_FOUND", 404], ["INVITATION_EXPIRED", 409],
  ["INVITATION_EXHAUSTED", 409], ["INVITATION_REVOKED", 409], ["FORBIDDEN", 403],
] as const)("preserves %s errors without logging bearer credentials [T090]", async (code, status) => {
  resolveOperation.mockRejectedValue(new SchoolError(code, "Convite indisponível.", status));
  const response = await resolve(request(), context);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code, message: "Convite indisponível." });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("masks unexpected errors and validates token shape through the use case [T090]", async () => {
  expect((await resolve(request(), { params: Promise.resolve({ id: "" }) })).status).toBe(400);
  acceptOperation.mockRejectedValue(new Error("private database details and bearer-token"));
  const response = await accept(request(), context);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
});
