/**
 * TM080 — `POST /api/me/training-licenses/[id]/adaptations/[aid]/decide`.
 * Authenticated (schoolResponse), thin adapter over DecidePlanAdaptation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  decideExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/decide-plan-adaptation", () => ({
  DecidePlanAdaptation: class { execute = mocks.decideExecute; },
}));

import { POST } from "@/app/api/me/training-licenses/[id]/adaptations/[aid]/decide/route";
import { SchoolError } from "@/modules/school/domain/errors";

const ctx = () => ({ params: Promise.resolve({ id: "lic-1", aid: "adapt-1" }) });
const req = (body: unknown) => new Request("http://test/api/me/training-licenses/lic-1/adaptations/adapt-1/decide", {
  method: "POST", body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "athlete-1" } });
  mocks.decideExecute.mockResolvedValue({ adaptation: { id: "adapt-1", status: "ACCEPTED" }, assignment: { id: "wa-1" } });
});

describe("POST /api/me/training-licenses/[id]/adaptations/[aid]/decide [TM080]", () => {
  it("exige sessão (401 sem auth)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ decision: "ACCEPT" }), ctx());
    expect(res.status).toBe(401);
    expect(mocks.decideExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req({ decision: "ACCEPT" }), ctx());
    expect(res.status).toBe(404);
  });

  it("delega ao caso de uso com licenseId/adaptationId da URL, não do corpo", async () => {
    await POST(req({ decision: "ACCEPT", licenseId: "outra", adaptationId: "outro" }), ctx());
    expect(mocks.decideExecute).toHaveBeenCalledWith("athlete-1", expect.objectContaining({ licenseId: "lic-1", adaptationId: "adapt-1" }));
  });

  it("decisão por usuário que não é o atleta dono retorna 403", async () => {
    mocks.decideExecute.mockRejectedValue(new SchoolError("FORBIDDEN", "not owner", 403));
    const res = await POST(req({ decision: "ACCEPT" }), ctx());
    expect(res.status).toBe(403);
  });

  it("200 em sucesso", async () => {
    const res = await POST(req({ decision: "ACCEPT" }), ctx());
    expect(res.status).toBe(200);
  });
});
