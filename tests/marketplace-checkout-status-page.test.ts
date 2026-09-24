/**
 * TM063 — loadCheckoutStatus (/marketplace/[idDoTreino]/checkout): ownership
 * scoping, same pattern as loadPlanoDetail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  purchaseFindFirst: vi.fn(),
  licenseFindFirst: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    trainingPurchase: { findFirst: mocks.purchaseFindFirst },
    trainingLicense: { findFirst: mocks.licenseFindFirst },
  },
}));

import { loadCheckoutStatus } from "@/app/marketplace/[idDoTreino]/checkout/page";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadCheckoutStatus [TM063]", () => {
  it("filtra por (id, athleteId) — nunca retorna compra de outro atleta", async () => {
    mocks.purchaseFindFirst.mockResolvedValue({ id: "pur-1", status: "PENDING", productId: "prod-1", pricePaid: 4990, currency: "BRL", product: { title: "Plano" } });
    mocks.licenseFindFirst.mockResolvedValue(null);
    await loadCheckoutStatus("athlete-1", "pur-1");
    expect(mocks.purchaseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pur-1", athleteId: "athlete-1" },
    }));
  });

  it("compra inexistente ou de outro atleta retorna null (nunca vaza existência)", async () => {
    mocks.purchaseFindFirst.mockResolvedValue(null);
    const out = await loadCheckoutStatus("athlete-2", "pur-de-outro");
    expect(out).toBeNull();
    expect(mocks.licenseFindFirst).not.toHaveBeenCalled();
  });

  it("resolve a licença associada quando já existe (compra COMPLETED)", async () => {
    mocks.purchaseFindFirst.mockResolvedValue({ id: "pur-1", status: "COMPLETED", productId: "prod-1", pricePaid: 4990, currency: "BRL", product: { title: "Plano" } });
    mocks.licenseFindFirst.mockResolvedValue({ id: "lic-1" });
    const out = await loadCheckoutStatus("athlete-1", "pur-1");
    expect(out?.license?.id).toBe("lic-1");
  });
});
