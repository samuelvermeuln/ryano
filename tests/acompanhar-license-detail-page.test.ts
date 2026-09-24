/**
 * TM083 — loadCoachLicenseView (/professor/acompanhar/planos/[licenseId]):
 * ONLY an ACTIVE engagement grants access (RF-302) — PENDING/ENDED/missing
 * resolve to null (404), never leaking the athlete's instance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coachFindUnique: vi.fn(),
  engagementFindFirst: vi.fn(),
  licenseFindUnique: vi.fn(),
  assignmentFindMany: vi.fn(),
  adaptationFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    coachProfile: { findUnique: mocks.coachFindUnique },
    licenseCoachEngagement: { findFirst: mocks.engagementFindFirst },
    trainingLicense: { findUnique: mocks.licenseFindUnique },
    workoutAssignment: { findMany: mocks.assignmentFindMany },
    planAdaptation: { findMany: mocks.adaptationFindMany },
  },
}));

import { loadCoachLicenseView } from "@/app/professor/acompanhar/planos/[licenseId]/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assignmentFindMany.mockResolvedValue([]);
  mocks.adaptationFindMany.mockResolvedValue([]);
  mocks.licenseFindUnique.mockResolvedValue({
    id: "lic-1", status: "ACTIVE", product: { title: "Plano X", sportType: "run", durationWeeks: 8 }, athlete: { name: "Ana" },
  });
});

describe("loadCoachLicenseView [TM083]", () => {
  it("sem CoachProfile retorna null", async () => {
    mocks.coachFindUnique.mockResolvedValue(null);
    const out = await loadCoachLicenseView("user-x", "lic-1");
    expect(out).toBeNull();
  });

  it("sem engagement ACTIVE (nunca convidado) retorna null", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindFirst.mockResolvedValue(null);
    const out = await loadCoachLicenseView("coach-user-1", "lic-1");
    expect(out).toBeNull();
    expect(mocks.licenseFindUnique).not.toHaveBeenCalled();
  });

  it("engagement apenas PENDING (não aceito) não concede acesso — a query já filtra status: ACTIVE", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindFirst.mockResolvedValue(null);
    await loadCoachLicenseView("coach-user-1", "lic-1");
    expect(mocks.engagementFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ACTIVE" }),
    }));
  });

  it("engagement ATIVO concede acesso à instância", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindFirst.mockResolvedValue({ id: "eng-1", scope: { full: true } });
    const out = await loadCoachLicenseView("coach-user-1", "lic-1");
    expect(out?.license.athlete.name).toBe("Ana");
  });

  it("licença inexistente (apesar de engagement ativo — dado inconsistente) retorna null", async () => {
    mocks.coachFindUnique.mockResolvedValue({ id: "coach-1", status: "ACTIVE" });
    mocks.engagementFindFirst.mockResolvedValue({ id: "eng-1", scope: { full: true } });
    mocks.licenseFindUnique.mockResolvedValue(null);
    const out = await loadCoachLicenseView("coach-user-1", "lic-1");
    expect(out).toBeNull();
  });
});
