/**
 * TM069 (RF-203) — idempotência e concorrência do checkout pago, integrando
 * as classes REAIS (não reimplementadas): `CreateMarketplaceCheckout` +
 * `ConfirmTrainingPurchaseFromWebhook` sobre um Prisma mockado em memória —
 * mesma convenção de `tests/e2e-marketplace-free-flow.test.ts` (TM055).
 *
 * Os 4 casos do criterio desta task: dupla entrega de webhook, retry de
 * checkout, cancelamento (evento não-completed), e o navegador chegando
 * antes do webhook. Nenhum duplica licença nem ativa compra sem confirmação.
 */
import { describe, expect, it, vi } from "vitest";
import { CreateMarketplaceCheckout } from "@/modules/school/application/create-marketplace-checkout";
import { ConfirmTrainingPurchaseFromWebhook } from "@/modules/school/application/confirm-training-purchase-from-webhook";

const NOW = new Date("2026-09-24T12:00:00Z");
const ATHLETE_ID = "athlete-idem-1";
const PRODUCT_ID = "prod-idem-1";
const VERSION_ID = "ver-idem-1";

function withTx<T extends object>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

function makeSharedDb() {
  const productRow = {
    id: PRODUCT_ID, title: "Plano pago — idempotência", status: "PUBLISHED", visibility: "PUBLIC",
    priceCents: 4990, currency: "BRL", currentVersionId: VERSION_ID, coachId: "coach-idem-1", schoolId: null,
  };

  let purchaseRow: Record<string, unknown> | null = null;
  const licenseRows: Array<Record<string, unknown>> = [];

  const db = {
    trainingProduct: { findUnique: vi.fn().mockImplementation(() => Promise.resolve(purchaseRow ? { ...productRow } : { ...productRow })) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    trainingProductAudience: { findFirst: vi.fn().mockResolvedValue(null) },
    trainingPurchase: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(purchaseRow)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        purchaseRow = { id: "pur-idem-1", ...data };
        return Promise.resolve(purchaseRow);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
        if (!purchaseRow || purchaseRow.id !== where.id) return Promise.resolve(null);
        if (where.status && purchaseRow.status !== where.status) return Promise.resolve(null);
        purchaseRow = { ...purchaseRow, ...data };
        return Promise.resolve(purchaseRow);
      }),
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(purchaseRow)),
    },
    trainingLicense: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { purchaseId: string } }) =>
        Promise.resolve(licenseRows.find((l) => l.purchaseId === where.purchaseId) ?? null)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `lic-idem-${licenseRows.length + 1}`, ...data };
        licenseRows.push(row);
        return Promise.resolve(row);
      }),
    },
    sellerAccount: { upsert: vi.fn().mockResolvedValue({ id: "seller-acc-idem-1" }) },
    sellerLedgerEntry: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
  };

  return { db: withTx(db), licenseRows, getPurchase: () => purchaseRow };
}

function checkoutSessionCompletedEvent(checkoutId: string, over: Record<string, unknown> = {}) {
  return {
    id: "evt_idem_1", type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: checkoutId, amount_total: 4990, currency: "brl",
        payment_status: "paid", payment_intent: "pi_idem_1",
        metadata: { productId: PRODUCT_ID, versionId: VERSION_ID, athleteId: ATHLETE_ID },
        ...over,
      },
    },
  } as never;
}

describe("Idempotência/concorrência do checkout pago [TM069]", () => {
  it("dupla entrega de webhook (Stripe at-least-once): a segunda entrega não cria uma segunda licença", async () => {
    const { db, licenseRows } = makeSharedDb();
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" }) };
    const checkout = new CreateMarketplaceCheckout(db, () => NOW, mockProvider);
    const out = await checkout.execute(ATHLETE_ID, { productId: PRODUCT_ID, idempotencyKey: "idem-key-1" });
    if (!("purchase" in out)) throw new Error("expected paid checkout");
    const checkoutId = `checkout:${ATHLETE_ID}:idem-key-1`;

    const confirm = new ConfirmTrainingPurchaseFromWebhook(db, () => NOW);
    const first = await confirm.execute(checkoutSessionCompletedEvent(checkoutId));
    const second = await confirm.execute(checkoutSessionCompletedEvent(checkoutId));

    expect(first.handled && !first.alreadyProcessed).toBe(true);
    expect(second.handled && second.alreadyProcessed).toBe(true);
    expect(licenseRows).toHaveLength(1);
  });

  it("retry de checkout com o mesmo idempotencyKey: uma única compra PENDING, mesmo checkoutId reenviado ao provedor como Idempotency-Key", async () => {
    const { db } = makeSharedDb();
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" }) };
    const checkout = new CreateMarketplaceCheckout(db, () => NOW, mockProvider);

    const first = await checkout.execute(ATHLETE_ID, { productId: PRODUCT_ID, idempotencyKey: "idem-key-2" });
    const second = await checkout.execute(ATHLETE_ID, { productId: PRODUCT_ID, idempotencyKey: "idem-key-2" });

    if (!("purchase" in first) || !("purchase" in second)) throw new Error("expected paid checkout");
    expect(first.purchase.id).toBe(second.purchase.id);
    expect(db.trainingPurchase.create).toHaveBeenCalledTimes(1);
    // Both provider calls use the SAME idempotencyKey — Stripe's own
    // Idempotency-Key handling (docs.stripe.com/api/idempotent_requests)
    // returns the same session on the real API even though this use case
    // calls the provider on every retry (TM058's own doc comment).
    const calls = mockProvider.createCheckoutSession.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey);
  });

  it("cancelamento (checkout.session.expired): compra permanece PENDING, nenhuma licença é criada", async () => {
    const { db, licenseRows, getPurchase } = makeSharedDb();
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" }) };
    const checkout = new CreateMarketplaceCheckout(db, () => NOW, mockProvider);
    await checkout.execute(ATHLETE_ID, { productId: PRODUCT_ID, idempotencyKey: "idem-key-3" });
    const checkoutId = `checkout:${ATHLETE_ID}:idem-key-3`;

    const confirm = new ConfirmTrainingPurchaseFromWebhook(db, () => NOW);
    const out = await confirm.execute({
      id: "evt_expired_1", type: "checkout.session.expired",
      data: { object: { client_reference_id: checkoutId } },
    } as never);

    expect(out.handled).toBe(false);
    expect(getPurchase()?.status).toBe("PENDING");
    expect(licenseRows).toHaveLength(0);
  });

  it("callback do navegador chegando ANTES do webhook: a compra segue PENDING até o webhook processar, sem se auto-ativar", async () => {
    const { db, licenseRows, getPurchase } = makeSharedDb();
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" }) };
    const checkout = new CreateMarketplaceCheckout(db, () => NOW, mockProvider);
    await checkout.execute(ATHLETE_ID, { productId: PRODUCT_ID, idempotencyKey: "idem-key-4" });
    const checkoutId = `checkout:${ATHLETE_ID}:idem-key-4`;

    // Simula o navegador voltando do Stripe (redirect de success_url) antes
    // do webhook chegar — não existe nenhuma ação de "confirmar" disparada
    // pela navegação em si; só uma leitura do estado atual (mesma leitura
    // que `loadCheckoutStatus`, TM063, faz).
    expect(getPurchase()?.status).toBe("PENDING");
    expect(licenseRows).toHaveLength(0);

    const confirm = new ConfirmTrainingPurchaseFromWebhook(db, () => NOW);
    await confirm.execute(checkoutSessionCompletedEvent(checkoutId));

    expect(getPurchase()?.status).toBe("COMPLETED");
    expect(licenseRows).toHaveLength(1);
  });
});
