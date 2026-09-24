/**
 * TM064 — ReconcileMarketplacePayments: replays undelivered provider events
 * through the SAME idempotent use cases the live webhook dispatches to.
 * Criterio de conclusao: rodar o job duas vezes sobre o mesmo evento não
 * duplica licença — covered here by asserting the dispatch itself is
 * idempotent-by-delegation (the real idempotency lives in
 * ConfirmTrainingPurchaseFromWebhook/RefundTrainingPurchase, already tested
 * in their own suites); this suite verifies orchestration: dispatch by
 * event type, summary counting, and one failing event never aborting the batch.
 */
import { describe, expect, it, vi } from "vitest";
import { ReconcileMarketplacePayments } from "@/modules/school/application/reconcile-marketplace-payments";

function stripeEvent(overrides: Partial<{ id: string; type: string }> = {}) {
  return { id: overrides.id ?? "evt_1", type: overrides.type ?? "checkout.session.completed", data: { object: {} } } as never;
}

describe("ReconcileMarketplacePayments [TM064]", () => {
  it("despacha checkout.session.completed para ConfirmTrainingPurchaseFromWebhook e conta confirmado/já processado", async () => {
    const provider = { listUndeliveredEvents: vi.fn().mockResolvedValue([
      stripeEvent({ id: "evt_1" }),
      stripeEvent({ id: "evt_2" }),
    ]) };
    const confirmPurchase = { execute: vi.fn()
      .mockResolvedValueOnce({ handled: true, alreadyProcessed: false })
      .mockResolvedValueOnce({ handled: true, alreadyProcessed: true }) };
    const refundPurchase = { execute: vi.fn() };

    const job = new ReconcileMarketplacePayments(provider, confirmPurchase, refundPurchase);
    const summary = await job.execute();

    expect(summary).toMatchObject({ checked: 2, confirmed: 1, alreadyProcessed: 1, refunded: 0, failed: [] });
    expect(refundPurchase.execute).not.toHaveBeenCalled();
  });

  it("despacha refund.created para RefundTrainingPurchase com kind provider_event", async () => {
    const provider = { listUndeliveredEvents: vi.fn().mockResolvedValue([stripeEvent({ id: "evt_r1", type: "refund.created" })]) };
    const confirmPurchase = { execute: vi.fn() };
    const refundPurchase = { execute: vi.fn().mockResolvedValue({ alreadyRefunded: false }) };

    const job = new ReconcileMarketplacePayments(provider, confirmPurchase, refundPurchase);
    const summary = await job.execute();

    expect(summary).toMatchObject({ checked: 1, refunded: 1, alreadyProcessed: 0 });
    expect(confirmPurchase.execute).not.toHaveBeenCalled();
    expect(refundPurchase.execute).toHaveBeenCalledWith({ kind: "provider_event", event: expect.objectContaining({ id: "evt_r1" }) });
  });

  it("evento repetido (reprocessado pela segunda vez) conta como já processado, nunca uma segunda confirmação", async () => {
    const provider = { listUndeliveredEvents: vi.fn().mockResolvedValue([stripeEvent({ id: "evt_1" })]) };
    const confirmPurchase = { execute: vi.fn().mockResolvedValue({ handled: true, alreadyProcessed: true }) };
    const refundPurchase = { execute: vi.fn() };

    const job = new ReconcileMarketplacePayments(provider, confirmPurchase, refundPurchase);
    const first = await job.execute();
    const second = await job.execute();

    expect(first.confirmed).toBe(0);
    expect(first.alreadyProcessed).toBe(1);
    expect(second.confirmed).toBe(0);
    expect(second.alreadyProcessed).toBe(1);
  });

  it("um evento com falha (erro ao processar) é registrado em failed e não aborta o restante do lote", async () => {
    const provider = { listUndeliveredEvents: vi.fn().mockResolvedValue([
      stripeEvent({ id: "evt_bad" }),
      stripeEvent({ id: "evt_ok" }),
    ]) };
    const confirmPurchase = { execute: vi.fn()
      .mockRejectedValueOnce(new Error("compra não encontrada"))
      .mockResolvedValueOnce({ handled: true, alreadyProcessed: false }) };
    const refundPurchase = { execute: vi.fn() };

    const job = new ReconcileMarketplacePayments(provider, confirmPurchase, refundPurchase);
    const summary = await job.execute();

    expect(summary.confirmed).toBe(1);
    expect(summary.failed).toEqual([{ eventId: "evt_bad", eventType: "checkout.session.completed", message: "compra não encontrada" }]);
  });

  it("evento de tipo não tratado (handled: false) não incrementa confirmado nem já processado", async () => {
    const provider = { listUndeliveredEvents: vi.fn().mockResolvedValue([stripeEvent({ id: "evt_x", type: "checkout.session.expired" })]) };
    const confirmPurchase = { execute: vi.fn().mockResolvedValue({ handled: false, reason: "unhandled_event_type" }) };
    const refundPurchase = { execute: vi.fn() };

    const job = new ReconcileMarketplacePayments(provider, confirmPurchase, refundPurchase);
    const summary = await job.execute();

    expect(summary).toMatchObject({ checked: 1, confirmed: 0, alreadyProcessed: 0, refunded: 0, failed: [] });
  });
});
