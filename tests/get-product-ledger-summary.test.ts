/**
 * TM068 (RF-205) — GetProductLedgerSummary. Deliberadamente uma agregação
 * separada de GetProductSalesSummary (TM023): soma SellerLedgerEntry
 * (TM067), nunca TrainingPurchase.pricePaid — os valores exibidos devem
 * bater com o ledger, não com um cálculo paralelo (criterio da task).
 */
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { GetProductLedgerSummary } from "@/modules/school/application/get-product-ledger-summary";

const product = {
  id: "prod-1", schoolId: null, coachId: "coach-1", title: "Base", description: null,
  sportType: "running", durationWeeks: 12, status: "PUBLISHED", visibility: "PUBLIC",
  priceCents: 4990, currency: "BRL", currentVersionId: "ver-1",
  slug: null, coverMediaId: null, objective: null, difficulty: null, goalType: null,
  targetEventType: null, targetDistance: null, sessionsPerWeek: null, sessionDurationMin: null,
  sessionDurationMax: null, weeklyMinutesMin: null, weeklyMinutesMax: null, sessionCount: null,
  equipment: null, language: null, availability: null, sellerPolicyVersion: null, previewVersionId: null,
  createdAt: new Date("2026-09-20T12:00:00Z"), updatedAt: new Date("2026-09-20T12:00:00Z"),
};

function makeDb(options: { product?: typeof product; groups?: unknown[] } = {}) {
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    trainingProduct: { findUnique: vi.fn().mockResolvedValue(options.product ?? product) },
    sellerLedgerEntry: {
      groupBy: vi.fn().mockResolvedValue(options.groups ?? [
        { type: "SALE", _count: { _all: 10 }, _sum: { grossAmount: 49900, feeAmount: 7485, netAmount: 42415 } },
        { type: "REFUND", _count: { _all: 2 }, _sum: { grossAmount: -9980, feeAmount: -1497, netAmount: -8483 } },
      ]),
    },
  };
}

describe("GetProductLedgerSummary [TM068]", () => {
  it("agrega bruto/taxa/líquido a partir do ledger — REFUND já é o espelho negativo, soma dá a posição líquida atual", async () => {
    const db = makeDb();
    const summary = await new GetProductLedgerSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" });
    expect(summary).toEqual({
      productId: "prod-1",
      currency: "BRL",
      grossCents: 49900 - 9980,
      feeCents: 7485 - 1497,
      netCents: 42415 - 8483,
      saleEntries: 10,
      refundEntries: 2,
    });
  });

  it("consulta o ledger filtrando pela relação com a compra do produto (nunca soma pricePaid do TrainingPurchase)", async () => {
    const db = makeDb();
    await new GetProductLedgerSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" });
    expect(db.sellerLedgerEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { purchase: { productId: "prod-1" } },
    }));
  });

  it("produto sem nenhuma entrada de ledger retorna zeros, não erro", async () => {
    const db = makeDb({ groups: [] });
    const summary = await new GetProductLedgerSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" });
    expect(summary).toMatchObject({ grossCents: 0, feeCents: 0, netCents: 0, saleEntries: 0, refundEntries: 0 });
  });

  it("rejeita coach que não é dono do produto", async () => {
    const db = makeDb({ product: { ...product, coachId: "coach-2" } });
    await expect(new GetProductLedgerSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(db.sellerLedgerEntry.groupBy).not.toHaveBeenCalled();
  });

  it("rejeita produto inexistente", async () => {
    const db = makeDb();
    db.trainingProduct.findUnique.mockResolvedValue(null);
    await expect(new GetProductLedgerSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-x" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND", status: 404 });
  });
});
