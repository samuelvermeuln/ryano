/**
 * TM082 — loadAcompanharOverview (/professor/acompanhar/planos): pending
 * invites carry no athlete-personal data (RF-302); active engagements do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coachFindUnique: vi.fn(),
  engagementFindMany: vi.fn(),
  adaptationFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    coachProfile: { findUnique: mocks.coachFindUnique },
    licenseCoachEngagement: { findMany: mocks.engagementFindMany },
    planAdaptation: { findMany: mocks.adaptationFindMany },
  },
}));

import { loadAcompanharOverview } from "@/app/professor/acompanhar/planos/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.adaptationFindMany.mockResolvedValue([]);
});

describe("loadAcompanharOverview [TM082]", () => {
  it("sem CoachProfile retorna null (onboarding, não erro)", async () => {
    mocks.coachFindUnique.mockResolvedValue(null);
    const out = await loadAcompanharOverview("user-sem-coach");
    expect(out).toBeNull();
  });

  it("busca convites PENDING e engagements ACTIVE separadamente, escopados ao coach", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindMany
      .mockResolvedValueOnce([{ id: "eng-pending-1", requestedAt: new Date(), scope: { full: true }, license: { id: "lic-1", product: { title: "Plano X", sportType: "run" } } }])
      .mockResolvedValueOnce([{ id: "eng-active-1", acceptedAt: new Date(), scope: { sportTypes: ["swim"] }, license: { id: "lic-2", product: { title: "Plano Y", sportType: "swim" }, athlete: { name: "Ana" } } }]);

    const out = await loadAcompanharOverview("coach-user-1");
    expect(out?.pending).toHaveLength(1);
    expect(out?.active).toHaveLength(1);
    expect(mocks.engagementFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { coachId: "coach-1", status: "PENDING" } }));
    expect(mocks.engagementFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { coachId: "coach-1", status: "ACTIVE" } }));
  });

  it("convite PENDING nunca seleciona o nome do atleta (RF-302)", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindMany.mockResolvedValue([]);
    await loadAcompanharOverview("coach-user-1");
    const pendingCallArgs = mocks.engagementFindMany.mock.calls[0]![0] as { select: { license: { select: Record<string, unknown> } } };
    expect(pendingCallArgs.select.license.select).not.toHaveProperty("athlete");
  });

  it("ajustes pendentes escopados ao coach", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindMany.mockResolvedValue([]);
    await loadAcompanharOverview("coach-user-1");
    expect(mocks.adaptationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { coachId: "coach-1", status: "PENDING" } }));
  });
});
