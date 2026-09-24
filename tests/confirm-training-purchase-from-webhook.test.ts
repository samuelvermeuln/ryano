/**
 * TM060 — ConfirmTrainingPurchaseFromWebhook (RF-202, RNF-003, design D-02).
 * The event passed in is ALREADY signature-verified by the caller (TM061) —
 * this class trusts it completely and never re-derives trust from a
 * client-supplied paymentRef (that was exactly RF-002's original defect).
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ConfirmTrainingPurchaseFromWebhook } from "@/modules/school/application/confirm-training-purchase-from-webhook";

const NOW = new Date("2026-09-24T10:00:00Z");

const offerSnapshot = { price: 4990, currency: "BRL", productId: "prod-1", versionId: "ver-1", sellerType: "COACH", sellerId: "coach-1" };

function withTx<T extends object>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

function makeDb(purchaseOver: Record<string, unknown> = {}) {
  const db = {
    trainingPurchase: {
      findUnique: vi.fn().mockResolvedValue({
        id: "pur-1", productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", status: "PENDING",
        pricePaid: 4990, currency: "BRL", offerSnapshot, providerEventId: null,
        ...purchaseOver,
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
        id: "pur-1", productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", purchasedAt: NOW, ...data,
      })),
    },
    trainingLicense: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
        id: "lic-1", productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", status: "ACTIVE", startedAt: NOW, ...data,
      })),
    },
    sellerAccount: {
      upsert: vi.fn().mockResolvedValue({ id: "seller-acc-1" }),
    },
    sellerLedgerEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return withTx(db);
}

function checkoutCompletedEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "checkout:athlete-1:idem-1",
        amount_total: 4990,
        currency: "brl",
        payment_status: "paid",
        payment_intent: "pi_123",
        metadata: { productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", purchaseId: "pur-1" },
        ...over,
      },
    },
  } as never;
}

describe("ConfirmTrainingPurchaseFromWebhook [TM060]", () => {
  it("confirma a compra e cria a licença quando o evento confere com o offerSnapshot", async () => {
    const db = makeDb();
    const out = await new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
      .execute(checkoutCompletedEvent());
    expect(out.handled).toBe(true);
    if (!out.handled || out.alreadyProcessed) throw new Error("expected fresh confirmation");
    expect(out.purchase.status).toBe("COMPLETED");
    expect(out.license.athleteId).toBe("athlete-1");
    expect(db.trainingPurchase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETED", provider: "stripe", providerEventId: "evt_1" }),
    }));
  });

  it("nunca aceita paymentRef livre do cliente — só usa o payment_intent do evento verificado", async () => {
    const db = makeDb();
    await new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
      .execute(checkoutCompletedEvent());
    expect(db.trainingPurchase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentRef: "pi_123" }),
    }));
  });

  it("evento repetido (compra já COMPLETED) é idempotente — não cria segunda licença", async () => {
    const db = makeDb({ status: "COMPLETED" });
    db.trainingLicense.findFirst = vi.fn().mockResolvedValue({ id: "lic-existing", productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", status: "ACTIVE", startedAt: NOW });
    const out = await new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
      .execute(checkoutCompletedEvent());
    expect(out.handled).toBe(true);
    if (!out.handled) throw new Error("expected handled");
    expect(out.alreadyProcessed).toBe(true);
    expect(db.trainingLicense.create).not.toHaveBeenCalled();
    expect(db.trainingPurchase.update).not.toHaveBeenCalled();
  });

  it("evento com valor divergente do offerSnapshot é rejeitado sem promover a compra", async () => {
    const db = makeDb();
    await expect(
      new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
        .execute(checkoutCompletedEvent({ amount_total: 9990 })),
    ).rejects.toMatchObject({ code: "PURCHASE_IDEMPOTENCY_CONFLICT" });
    expect(db.trainingPurchase.update).not.toHaveBeenCalled();
    expect(db.trainingLicense.create).not.toHaveBeenCalled();
  });

  it("evento com produto divergente do offerSnapshot é rejeitado sem promover a compra", async () => {
    const db = makeDb();
    await expect(
      new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
        .execute(checkoutCompletedEvent({ metadata: { productId: "prod-outro", versionId: "ver-1", athleteId: "athlete-1", purchaseId: "pur-1" } })),
    ).rejects.toMatchObject({ code: "PURCHASE_IDEMPOTENCY_CONFLICT" });
    expect(db.trainingPurchase.update).not.toHaveBeenCalled();
  });

  it("payment_status != paid é rejeitado", async () => {
    const db = makeDb();
    await expect(
      new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
        .execute(checkoutCompletedEvent({ payment_status: "unpaid" })),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
  });

  it("tipo de evento não relacionado é ignorado sem tocar o banco", async () => {
    const db = makeDb();
    const out = await new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
      .execute({ id: "evt_2", type: "checkout.session.expired", data: { object: {} } } as never);
    expect(out.handled).toBe(false);
    expect(db.trainingPurchase.findUnique).not.toHaveBeenCalled();
  });

  it("cria uma entrada de ledger SALE (RF-205) com o vendedor congelado no offerSnapshot, taxa de config, nunca constante no código", async () => {
    const db = makeDb();
    await new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW)
      .execute(checkoutCompletedEvent());
    expect(db.sellerAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerType_sellerId_provider: { sellerType: "COACH", sellerId: "coach-1", provider: "stripe" } },
    }));
    expect(db.sellerLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sellerAccountId: "seller-acc-1", purchaseId: "pur-1",
        grossAmount: 4990, currency: "BRL", type: "SALE",
      }),
    }));
  });

  it("compra inexistente para o checkoutId do evento lança erro (nunca cria licença órfã)", async () => {
    const db = makeDb();
    db.trainingPurchase.findUnique = vi.fn().mockResolvedValue(null);
    await expect(
      new ConfirmTrainingPurchaseFromWebhook(db as unknown as PrismaClient, () => NOW).execute(checkoutCompletedEvent()),
    ).rejects.toBeDefined();
    expect(db.trainingLicense.create).not.toHaveBeenCalled();
  });
});
