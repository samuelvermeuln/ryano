/**
 * TM065 (RF-204) — RefundTrainingPurchase: only from a verified provider
 * event or an audited admin action. Revokes future use, never touches
 * already-executed sessions/history.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { RefundTrainingPurchase } from "@/modules/school/application/refund-training-purchase";

const NOW = new Date("2026-09-24T10:00:00Z");

function withTx<T extends object>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    trainingPurchase: {
      findFirst: vi.fn().mockResolvedValue({ id: "pur-1" }),
      findUnique: vi.fn().mockResolvedValue({ id: "pur-1", status: "COMPLETED" }),
      update: vi.fn().mockResolvedValue({}),
    },
    trainingLicense: {
      findFirst: vi.fn().mockResolvedValue({ id: "lic-1", status: "ACTIVE" }),
      update: vi.fn().mockResolvedValue({}),
    },
    adminAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    sellerLedgerEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    ...over,
  };
  return withTx(db);
}

function refundEvent(paymentIntent = "pi_123") {
  return {
    id: "evt_refund_1", type: "refund.created",
    data: { object: { id: "re_1", payment_intent: paymentIntent } },
  } as never;
}

describe("RefundTrainingPurchase [TM065]", () => {
  it("evento de provedor: encontra a compra pelo payment_intent (paymentRef) e reembolsa", async () => {
    const db = makeDb();
    const out = await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() });
    expect(out.alreadyRefunded).toBe(false);
    expect(db.trainingPurchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { paymentRef: "pi_123" } }));
    expect(db.trainingPurchase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REFUNDED" }),
    }));
  });

  it("revoga a licença (direito de sessões futuras) sem apagar execuções passadas", async () => {
    const db = makeDb();
    await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() });
    expect(db.trainingLicense.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REVOKED", revokedAt: NOW }),
    }));
    // Nothing in this use case ever touches workoutAssignment/workoutExecution.
  });

  it("idempotente: compra já REFUNDED é no-op, não erro", async () => {
    const db = makeDb({ trainingPurchase: { findFirst: vi.fn().mockResolvedValue({ id: "pur-1" }), findUnique: vi.fn().mockResolvedValue({ id: "pur-1", status: "REFUNDED" }), update: vi.fn() } });
    const out = await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() });
    expect(out.alreadyRefunded).toBe(true);
    expect(db.trainingPurchase.update).not.toHaveBeenCalled();
    expect(db.trainingLicense.update).not.toHaveBeenCalled();
  });

  it("rejeita reembolso de compra que não está COMPLETED", async () => {
    const db = makeDb({ trainingPurchase: { findFirst: vi.fn().mockResolvedValue({ id: "pur-1" }), findUnique: vi.fn().mockResolvedValue({ id: "pur-1", status: "PENDING" }), update: vi.fn() } });
    await expect(new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() })).rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
  });

  it("ação administrativa grava autoria (actorUserId) e motivo — auditável", async () => {
    const db = makeDb();
    await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "admin_action", actorUserId: "admin-1", purchaseId: "pur-1", reason: "Solicitação do comprador" });
    expect(db.trainingPurchase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ refundReason: "Solicitação do comprador" }),
    }));
    // RF-204 — registro DURÁVEL de auditoria (AdminAuditLog), não apenas o
    // metric fire-and-forget: autoria, ação, entidade e motivo persistidos.
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: "admin-1", action: "MARKETPLACE_PURCHASE_REFUNDED",
        entityType: "TrainingPurchase", entityId: "pur-1",
        metadata: expect.objectContaining({ reason: "Solicitação do comprador" }),
      }),
    }));
  });

  it("evento de provedor NÃO grava AdminAuditLog (não é ação administrativa)", async () => {
    const db = makeDb();
    await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() });
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("reverte a entrada de ledger da venda original (RF-205) espelhando exatamente os valores, nunca recalculando", async () => {
    const db = makeDb({
      sellerLedgerEntry: {
        findFirst: vi.fn().mockResolvedValue({ sellerAccountId: "seller-acc-1", grossAmount: 4990, feeAmount: 748, netAmount: 4242, currency: "BRL" }),
        create: vi.fn().mockResolvedValue({}),
      },
    });
    await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() });
    expect(db.sellerLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sellerAccountId: "seller-acc-1", purchaseId: "pur-1",
        grossAmount: -4990, feeAmount: -748, netAmount: -4242, currency: "BRL", type: "REFUND",
      }),
    }));
  });

  it("sem entrada de venda no ledger (compra pré-TM067): reembolso segue normalmente, sem criar reversão", async () => {
    const db = makeDb(); // default sellerLedgerEntry.findFirst -> null
    const out = await new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundEvent() });
    expect(out.alreadyRefunded).toBe(false);
    expect(db.sellerLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("evento de reembolso sem payment_intent é rejeitado", async () => {
    const db = makeDb();
    const eventWithoutPaymentIntent = { id: "evt_refund_2", type: "refund.created", data: { object: { id: "re_2" } } } as never;
    await expect(new RefundTrainingPurchase(db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: eventWithoutPaymentIntent }))
      .rejects.toMatchObject({ code: "PURCHASE_IDEMPOTENCY_CONFLICT" });
  });
});
