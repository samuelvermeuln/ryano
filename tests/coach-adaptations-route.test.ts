/**
 * TM079 — `POST /api/coach/training-licenses/[id]/adaptations`.
 * Authenticated (schoolResponse), thin adapter over ProposePlanAdaptation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  proposeExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/propose-plan-adaptation", () => ({
  ProposePlanAdaptation: class { execute = mocks.proposeExecute; },
}));

import { POST } from "@/app/api/coach/training-licenses/[id]/adaptations/route";
import { SchoolError } from "@/modules/school/domain/errors";

const ctx = () => ({ params: Promise.resolve({ id: "lic-1" }) });
const req = (body: unknown) => new Request("http://test/api/coach/training-licenses/lic-1/adaptations", {
  method: "POST", body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "coach-user-1" } });
  mocks.proposeExecute.mockResolvedValue({ id: "adapt-1", status: "PENDING" });
});

describe("POST /api/coach/training-licenses/[id]/adaptations [TM079]", () => {
  it("exige sessão (401 sem auth)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ workoutAssignmentId: "wa-1", reason: "x", proposedChange: { scheduledAt: "2026-09-26T09:00:00.000Z" }, expectedVersion: 0 }), ctx());
    expect(res.status).toBe(401);
    expect(mocks.proposeExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req({}), ctx());
    expect(res.status).toBe(404);
  });

  it("delega ao caso de uso com licenseId da URL, não do corpo", async () => {
    await POST(req({ workoutAssignmentId: "wa-1", reason: "x", proposedChange: { scheduledAt: "2026-09-26T09:00:00.000Z" }, expectedVersion: 0, licenseId: "outra" }), ctx());
    expect(mocks.proposeExecute).toHaveBeenCalledWith("coach-user-1", expect.objectContaining({ licenseId: "lic-1" }));
  });

  it("coach sem engagement ativo na licença recebe 403", async () => {
    mocks.proposeExecute.mockRejectedValue(new SchoolError("FORBIDDEN", "no active engagement", 403));
    const res = await POST(req({}), ctx());
    expect(res.status).toBe(403);
  });

  it("201 em sucesso", async () => {
    const res = await POST(req({ workoutAssignmentId: "wa-1", reason: "x", proposedChange: { scheduledAt: "2026-09-26T09:00:00.000Z" }, expectedVersion: 0 }), ctx());
    expect(res.status).toBe(201);
  });
});
