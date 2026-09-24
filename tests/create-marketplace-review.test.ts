/**
 * TM047 — CreateMarketplaceReview (RF-112).
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CreateMarketplaceReview } from "@/modules/school/application/create-marketplace-review";

const now = new Date("2026-09-23T12:00:00Z");

function makeDb(over: Record<string, unknown> = {}) {
  return {
    trainingPurchase: {
      findUnique: vi.fn().mockResolvedValue({
        id: "pur-1", productId: "prod-1", athleteId: "athlete-1", status: "COMPLETED", versionId: "ver-1",
      }),
    },
    trainingLicense: {
      findFirst: vi.fn().mockResolvedValue({ id: "lic-1", status: "ACTIVE" }),
    },
    workoutExecution: {
      findFirst: vi.fn().mockResolvedValue({ id: "exec-1" }),
    },
    trainingProduct: {
      findUnique: vi.fn().mockResolvedValue({ id: "prod-1", coachId: "coach-author" }),
    },
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({ userId: "author-user" }),
    },
    marketplaceReview: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "review-1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "review-1", ...data })),
    },
    ...over,
  } as unknown as PrismaClient;
}

describe("CreateMarketplaceReview [TM047]", () => {
  it("cria avaliação quando elegível", async () => {
    const db = makeDb();
    const out = await new CreateMarketplaceReview(db, () => now).execute("athlete-1", {
      productId: "prod-1", purchaseId: "pur-1", stars: 5, comment: "Ótimo plano",
    });
    expect(out).toMatchObject({ stars: 5, moderationStatus: "APPROVED" });
  });

  it("rejeita compra de outro atleta sem confirmar existência (mesmo código de 'não encontrada')", async () => {
    const db = makeDb({
      trainingPurchase: { findUnique: vi.fn().mockResolvedValue({ id: "pur-1", productId: "prod-1", athleteId: "outro-atleta", status: "COMPLETED", versionId: "ver-1" }) },
    });
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });
  });

  it("rejeita compra ainda não concluída", async () => {
    const db = makeDb({
      trainingPurchase: { findUnique: vi.fn().mockResolvedValue({ id: "pur-1", productId: "prod-1", athleteId: "athlete-1", status: "PENDING", versionId: "ver-1" }) },
    });
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });
  });

  it("rejeita sem nenhuma sessão registrada", async () => {
    const db = makeDb({ workoutExecution: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });
  });

  it("rejeita autoavaliação do autor", async () => {
    const db = makeDb();
    await expect(new CreateMarketplaceReview(db, () => now).execute("author-user", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });
  });

  it("segunda avaliação da mesma compra EDITA a existente, não cria outra", async () => {
    const db = makeDb({
      marketplaceReview: {
        findUnique: vi.fn().mockResolvedValue({ id: "review-1", stars: 3, comment: "ok" }),
        create: vi.fn(),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "review-1", ...data })),
      },
    });
    const out = await new CreateMarketplaceReview(db, () => now).execute("athlete-1", {
      productId: "prod-1", purchaseId: "pur-1", stars: 4, comment: "revisado",
    });
    expect(db.marketplaceReview.create).not.toHaveBeenCalled();
    expect(db.marketplaceReview.update).toHaveBeenCalled();
    expect(out).toMatchObject({ stars: 4 });
  });

  it("licença revogada não é elegível para avaliar", async () => {
    const db = makeDb({ trainingLicense: { findFirst: vi.fn().mockResolvedValue({ id: "lic-1", status: "REVOKED" }) } });
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });
  });

  it("licença concluída (COMPLETED) ainda pode avaliar", async () => {
    const db = makeDb({ trainingLicense: { findFirst: vi.fn().mockResolvedValue({ id: "lic-1", status: "COMPLETED" }) } });
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .resolves.toBeDefined();
  });

  it("corrida de criação concorrente (P2002) vira REVIEW_ALREADY_EXISTS, não erro cru", async () => {
    const db = makeDb({
      marketplaceReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(Object.assign(new Error("unique violation"), { code: "P2002" })),
        update: vi.fn(),
      },
    });
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 5 }))
      .rejects.toMatchObject({ code: "REVIEW_ALREADY_EXISTS" });
  });

  it("rejeita stars fora do intervalo 1..5", async () => {
    const db = makeDb();
    await expect(new CreateMarketplaceReview(db, () => now).execute("athlete-1", { productId: "prod-1", purchaseId: "pur-1", stars: 6 }))
      .rejects.toBeInstanceOf(Error);
  });
});
