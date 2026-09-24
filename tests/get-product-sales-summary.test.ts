/**
 * TM023 — GetProductSalesSummary.
 *
 * Cobre agregação por status + receita bruta, e garante (por FORMA, não só
 * valor) que o DTO nunca carrega dado individual — nenhum athleteId, nenhuma
 * execução, nenhuma biometria, nenhum contato de comprador (RF-104/RNF-002).
 */
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { GetProductSalesSummary } from "@/modules/school/application/get-product-sales-summary";

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

function makeDb(options: { product?: typeof product; groups?: unknown[]; activeLicenses?: number } = {}) {
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    trainingProduct: { findUnique: vi.fn().mockResolvedValue(options.product ?? product) },
    trainingPurchase: {
      groupBy: vi.fn().mockResolvedValue(options.groups ?? [
        { status: "COMPLETED", _count: { _all: 8 }, _sum: { pricePaid: 39920 } },
        { status: "PENDING", _count: { _all: 2 }, _sum: { pricePaid: null } },
        { status: "REFUNDED", _count: { _all: 1 }, _sum: { pricePaid: 4990 } },
      ]),
    },
    trainingLicense: { count: vi.fn().mockResolvedValue(options.activeLicenses ?? 6) },
  };
}

describe("GetProductSalesSummary [TM023]", () => {
  it("agrega volume, status e receita corretamente", async () => {
    const db = makeDb();
    const summary = await new GetProductSalesSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" });
    expect(summary).toEqual({
      productId: "prod-1",
      currency: "BRL",
      totalPurchases: 11,
      completedPurchases: 8,
      pendingPurchases: 2,
      refundedPurchases: 1,
      cancelledPurchases: 0,
      grossRevenueCents: 39920,
      activeLicenses: 6,
    });
  });

  it("DTO não contém nenhum campo de execução, biometria ou contato individual (forma, não só valor)", async () => {
    const db = makeDb();
    const summary = await new GetProductSalesSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" });
    expect(Object.keys(summary).sort()).toEqual([
      "activeLicenses", "cancelledPurchases", "completedPurchases", "currency", "grossRevenueCents",
      "pendingPurchases", "productId", "refundedPurchases", "totalPurchases",
    ]);
    const forbidden = ["athleteId", "athlete", "purchases", "items", "biometry", "heartRate", "email", "contact", "executions"];
    for (const key of forbidden) expect(summary).not.toHaveProperty(key);
  });

  it("produto sem nenhuma compra retorna zeros, não erro", async () => {
    const db = makeDb({ groups: [], activeLicenses: 0 });
    const summary = await new GetProductSalesSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" });
    expect(summary).toMatchObject({ totalPurchases: 0, grossRevenueCents: 0, activeLicenses: 0 });
  });

  it("rejeita coach que não é dono do produto", async () => {
    const db = makeDb({ product: { ...product, coachId: "coach-2" } });
    await expect(new GetProductSalesSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(db.trainingPurchase.groupBy).not.toHaveBeenCalled();
  });

  it("rejeita produto inexistente", async () => {
    const db = makeDb();
    db.trainingProduct.findUnique.mockResolvedValue(null);
    await expect(new GetProductSalesSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-x" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND", status: 404 });
  });

  it("rejeita ator sem CoachProfile", async () => {
    const db = makeDb();
    db.coachProfile.findUnique.mockResolvedValue(null);
    await expect(new GetProductSalesSummary(db as unknown as PrismaClient).execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });
});
