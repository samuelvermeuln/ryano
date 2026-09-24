/**
 * TM081 — `DELETE /api/me/training-licenses/[id]/coach-engagement`.
 * Authenticated (schoolResponse), thin adapter over RevokeCoachEngagement.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  revokeExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/revoke-coach-engagement", () => ({
  RevokeCoachEngagement: class { execute = mocks.revokeExecute; },
}));

import { DELETE } from "@/app/api/me/training-licenses/[id]/coach-engagement/route";
import { SchoolError } from "@/modules/school/domain/errors";

const ctx = () => ({ params: Promise.resolve({ id: "lic-1" }) });
const req = (query = "") => new Request(`http://test/api/me/training-licenses/lic-1/coach-engagement${query}`, { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "athlete-1" } });
  mocks.revokeExecute.mockResolvedValue({ revokedEngagementIds: ["eng-1"] });
});

describe("DELETE /api/me/training-licenses/[id]/coach-engagement [TM081]", () => {
  it("exige sessão (401 sem auth)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(401);
    expect(mocks.revokeExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(404);
  });

  it("delega ao caso de uso com licenseId da URL", async () => {
    await DELETE(req(), ctx());
    expect(mocks.revokeExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1" });
  });

  it("repassa coachId da query string quando presente", async () => {
    await DELETE(req("?coachId=coach-2"), ctx());
    expect(mocks.revokeExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1", coachId: "coach-2" });
  });

  it("revogação por não-dono retorna 403/404 (LICENSE_NOT_FOUND propagado)", async () => {
    mocks.revokeExecute.mockRejectedValue(new SchoolError("LICENSE_NOT_FOUND", "not found"));
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(404);
  });

  it("200 em sucesso", async () => {
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(200);
  });
});
