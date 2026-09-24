/**
 * TM044 — loadPlanoDetail (/app/planos/[licenseId]): ownership scoping and
 * progress computation, extracted from the page component so it is testable
 * without rendering JSX (same pattern as `getSchoolOverview`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  licenseFindFirst: vi.fn(),
  assignmentGroupBy: vi.fn(),
  assignmentFindFirst: vi.fn(),
  engagementFindFirst: vi.fn(),
  adaptationFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    trainingLicense: { findFirst: mocks.licenseFindFirst },
    workoutAssignment: { groupBy: mocks.assignmentGroupBy, findFirst: mocks.assignmentFindFirst },
    licenseCoachEngagement: { findFirst: mocks.engagementFindFirst },
    planAdaptation: { findMany: mocks.adaptationFindMany },
  },
}));

import { loadPlanoDetail } from "@/app/app/planos/[licenseId]/page";

function baseLicense(over: Record<string, unknown> = {}) {
  return {
    id: "lic-1", productId: "prod-1", versionId: "ver-1", status: "ACTIVE",
    activationMode: "START_NOW", activationStatus: "ACTIVATED", timezone: "America/Sao_Paulo",
    chosenStartLocalDate: "2026-09-21", anchorEventLocalDate: null,
    calendarInstantiated: true, completedAt: null, createdAt: new Date(),
    product: { id: "prod-1", title: "Plano 5k", description: null, sportType: "running", durationWeeks: 8, coach: { displayName: "Coach A" }, school: null },
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assignmentGroupBy.mockResolvedValue([]);
  mocks.assignmentFindFirst.mockResolvedValue(null);
  mocks.engagementFindFirst.mockResolvedValue(null);
  mocks.adaptationFindMany.mockResolvedValue([]);
});

describe("loadPlanoDetail [TM044]", () => {
  it("filtra por (id, athleteId) — nunca retorna licença de outro atleta", async () => {
    mocks.licenseFindFirst.mockResolvedValue(baseLicense());
    await loadPlanoDetail("athlete-1", "lic-1");
    expect(mocks.licenseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lic-1", athleteId: "athlete-1" },
    }));
  });

  it("licença inexistente ou de outro atleta retorna null (nunca vaza existência)", async () => {
    mocks.licenseFindFirst.mockResolvedValue(null);
    const out = await loadPlanoDetail("athlete-2", "lic-de-outro");
    expect(out).toBeNull();
  });

  it("calcula progresso (done/total) a partir dos status agregados", async () => {
    mocks.licenseFindFirst.mockResolvedValue(baseLicense());
    mocks.assignmentGroupBy.mockResolvedValue([
      { status: "COMPLETED", _count: { _all: 5 } },
      { status: "PARTIALLY_COMPLETED", _count: { _all: 1 } },
      { status: "JUSTIFIED", _count: { _all: 1 } },
      { status: "MISSED", _count: { _all: 2 } },
      { status: "SCHEDULED", _count: { _all: 3 } },
    ]);
    const out = await loadPlanoDetail("athlete-1", "lic-1");
    expect(out?.total).toBe(12);
    expect(out?.done).toBe(7); // COMPLETED + PARTIALLY_COMPLETED + JUSTIFIED, not MISSED/SCHEDULED
  });

  it("deriva o estado a partir de status/activationStatus, mesma lógica de ListMyTrainingLicenses", async () => {
    mocks.licenseFindFirst.mockResolvedValue(baseLicense({ activationStatus: "PENDING" }));
    const out = await loadPlanoDetail("athlete-1", "lic-1");
    expect(out?.state).toBe("not_started");
  });

  it("professor acompanhante ausente (Onda 3 não construída) não quebra — engagement null", async () => {
    mocks.licenseFindFirst.mockResolvedValue(baseLicense());
    const out = await loadPlanoDetail("athlete-1", "lic-1");
    expect(out?.coachEngagement).toBeNull();
    expect(out?.adaptations).toEqual([]);
  });
});
