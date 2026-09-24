/**
 * TM077 — `POST /api/me/training-licenses/[id]/coach-invitations`.
 * Authenticated (schoolResponse), thin adapter over InviteCoachToLicense.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  inviteExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/invite-coach-to-license", () => ({
  InviteCoachToLicense: class { execute = mocks.inviteExecute; },
}));

import { POST } from "@/app/api/me/training-licenses/[id]/coach-invitations/route";
import { SchoolError } from "@/modules/school/domain/errors";

const ctx = () => ({ params: Promise.resolve({ id: "lic-1" }) });
const req = (body: unknown) => new Request("http://test/api/me/training-licenses/lic-1/coach-invitations", {
  method: "POST", body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "athlete-1" } });
  mocks.inviteExecute.mockResolvedValue({ id: "eng-1", status: "PENDING" });
});

describe("POST /api/me/training-licenses/[id]/coach-invitations [TM077]", () => {
  it("exige sessão (401 sem auth)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ coachId: "coach-1", scope: { full: true } }), ctx());
    expect(res.status).toBe(401);
    expect(mocks.inviteExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req({ coachId: "coach-1", scope: { full: true } }), ctx());
    expect(res.status).toBe(404);
  });

  it("delega ao caso de uso com licenseId da URL, não do corpo", async () => {
    await POST(req({ coachId: "coach-1", scope: { full: true }, licenseId: "outra-licenca" }), ctx());
    expect(mocks.inviteExecute).toHaveBeenCalledWith("athlete-1", expect.objectContaining({ licenseId: "lic-1" }));
  });

  it("propaga LICENSE_NOT_FOUND do caso de uso (convite por não-dono da licença)", async () => {
    mocks.inviteExecute.mockRejectedValue(new SchoolError("LICENSE_NOT_FOUND", "not found"));
    const res = await POST(req({ coachId: "coach-1", scope: { full: true } }), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("LICENSE_NOT_FOUND");
  });

  it("201 em sucesso", async () => {
    const res = await POST(req({ coachId: "coach-1", scope: { full: true } }), ctx());
    expect(res.status).toBe(201);
  });
});
