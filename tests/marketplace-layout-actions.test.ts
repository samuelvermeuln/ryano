/**
 * TM050 — server actions persisting `CustomizableCardGrid` layout for the
 * three marketplace surfaces, each to its OWN `UserProfile` column (design
 * D-09): never the dashboard's `dashboardLayoutOrder`, and never each
 * other's column either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/server/auth-guards", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/server/db", () => ({ prisma: { userProfile: { upsert: mocks.upsert } } }));

import {
  saveMarketplaceCatalogLayoutAction, saveAthletePlanLayoutAction, saveCoachStudioLayoutAction,
} from "@/app/actions/marketplace-layout";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.upsert.mockResolvedValue({});
});

const validLayout = { layout: [{ id: "card-a", span: 1 as const }, { id: "card-b", span: 2 as const }] };

describe("marketplace layout actions [TM050]", () => {
  it("athlete-plan grava em athletePlanLayoutOrder, não em dashboardLayoutOrder", async () => {
    await saveAthletePlanLayoutAction(validLayout);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      update: { athletePlanLayoutOrder: validLayout.layout },
    }));
  });

  it("coach-studio grava em coachStudioLayoutOrder — coluna distinta de athlete-plan", async () => {
    await saveCoachStudioLayoutAction(validLayout);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { coachStudioLayoutOrder: validLayout.layout },
    }));
  });

  it("marketplace-catalog grava em marketplaceCatalogLayoutOrder — terceira coluna distinta", async () => {
    await saveMarketplaceCatalogLayoutAction(validLayout);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { marketplaceCatalogLayoutOrder: validLayout.layout },
    }));
  });

  it("rejeita layout vazio sem chamar o banco", async () => {
    const out = await saveAthletePlanLayoutAction({ layout: [] });
    expect(out.success).toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejeita span fora de 1..3 sem chamar o banco", async () => {
    const out = await saveCoachStudioLayoutAction({ layout: [{ id: "x", span: 4 as never }] });
    expect(out.success).toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("exige sessão (requireSession lança se não autenticado)", async () => {
    mocks.requireSession.mockRejectedValue(new Error("UNAUTHORIZED"));
    await expect(saveAthletePlanLayoutAction(validLayout)).rejects.toThrow();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
