/**
 * TM078 — `POST /api/coach/plan-invitations/[id]/accept`.
 * Authenticated (schoolResponse), thin adapter over AcceptCoachInvitation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  acceptExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/accept-coach-invitation", () => ({
  AcceptCoachInvitation: class { execute = mocks.acceptExecute; },
}));

import { POST } from "@/app/api/coach/plan-invitations/[id]/accept/route";
import { SchoolError } from "@/modules/school/domain/errors";

const ctx = () => ({ params: Promise.resolve({ id: "eng-1" }) });
const req = () => new Request("http://test/api/coach/plan-invitations/eng-1/accept", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "coach-user-1" } });
  mocks.acceptExecute.mockResolvedValue({ id: "eng-1", status: "ACTIVE" });
});

describe("POST /api/coach/plan-invitations/[id]/accept [TM078]", () => {
  it("exige sessão (401 sem auth)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(mocks.acceptExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req(), ctx());
    expect(res.status).toBe(404);
  });

  it("delega ao caso de uso com engagementId da URL", async () => {
    await POST(req(), ctx());
    expect(mocks.acceptExecute).toHaveBeenCalledWith("coach-user-1", { engagementId: "eng-1" });
  });

  it("coach diferente do convidado — 403 propagado", async () => {
    mocks.acceptExecute.mockRejectedValue(new SchoolError("FORBIDDEN", "not you", 403));
    const res = await POST(req(), ctx());
    expect(res.status).toBe(403);
  });

  it("aceite duplicado (já ACTIVE) retorna ENGAGEMENT_ALREADY_ACTIVE, não erro genérico", async () => {
    mocks.acceptExecute.mockRejectedValue(new SchoolError("ENGAGEMENT_ALREADY_ACTIVE", "already active"));
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ENGAGEMENT_ALREADY_ACTIVE");
  });

  it("200 em sucesso", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
  });
});
