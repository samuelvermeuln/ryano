/**
 * SAM-9 — atribuição financeira por titularidade do produto.
 *
 * Exercita a cadeia real de casos de uso (checkout -> webhook verificado ->
 * SellerLedgerEntry -> reembolso) sem mockar nenhum deles: só o banco é
 * substituído por um duplo em memória, e `stripe` nem entra em cena porque o
 * evento chega a `ConfirmTrainingPurchaseFromWebhook` já verificado, como em
 * produção (RF-202 / TM060).
 *
 * O que estes testes travam:
 *   - produto da escola  -> receita na SellerAccount da ESCOLA;
 *   - produto de professor -> receita na do PROFESSOR (não-regressão);
 *   - reembolso reverte o beneficiário da venda original, nunca o outro;
 *   - a taxa da plataforma é a mesma para os dois tipos de vendedor.
 *
 * Cobre o que o E2E de navegador não consegue: promover uma compra a COMPLETED
 * exige webhook verificado do provedor por invariante do domínio, e fabricar a
 * venda direto no banco testaria só o estado final.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CreateMarketplaceCheckout } from "@/modules/school/application/create-marketplace-checkout";
import { ConfirmTrainingPurchaseFromWebhook } from "@/modules/school/application/confirm-training-purchase-from-webhook";
import { RefundTrainingPurchase } from "@/modules/school/application/refund-training-purchase";

const NOW = new Date("2026-09-30T10:00:00Z");
const PRICE = 4990;

/** Produtos com a mesma forma, diferindo SÓ na titularidade (XOR do domínio). */
const SCHOOL_PRODUCT = {
  id: "prod-school", title: "Plano da escola", status: "PUBLISHED", visibility: "PUBLIC",
  priceCents: PRICE, currency: "BRL", currentVersionId: "ver-school",
  schoolId: "school-1", coachId: null,
};
const COACH_PRODUCT = {
  id: "prod-coach", title: "Plano do professor", status: "PUBLISHED", visibility: "PUBLIC",
  priceCents: PRICE, currency: "BRL", currentVersionId: "ver-coach",
  schoolId: null, coachId: "coach-1",
};

/**
 * Banco em memória compartilhado pelos três casos de uso, para que o SALE
 * gravado pelo webhook seja o mesmo que o reembolso encontra — é justamente
 * esse encadeamento que decide o beneficiário.
 */
function makeDb(product: Record<string, unknown>) {
  const purchases = new Map<string, Record<string, unknown>>();
  const licenses = new Map<string, Record<string, unknown>>();
  const sellerAccounts = new Map<string, Record<string, unknown>>();
  const ledger: Array<Record<string, unknown>> = [];

  const db = {
    trainingProduct: { findUnique: vi.fn().mockResolvedValue(product) },

    trainingPurchase: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: string; checkoutId?: string } }) => {
        if (where.id) return purchases.get(where.id) ?? null;
        for (const p of purchases.values()) if (p.checkoutId === where.checkoutId) return p;
        return null;
      }),
      // Como o reembolso do provedor chega: pelo payment_intent que a
      // confirmação gravou em `paymentRef` (TM060/TM065).
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { paymentRef?: string } }) => {
        for (const p of purchases.values()) if (p.paymentRef === where.paymentRef) return p;
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        purchases.set(data.id as string, { ...data });
        return data;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = purchases.get(where.id)!;
        const next = { ...current, ...data };
        purchases.set(where.id, next);
        return next;
      }),
    },

    trainingLicense: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { purchaseId: string } }) => {
        for (const l of licenses.values()) if (l.purchaseId === where.purchaseId) return l;
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        licenses.set(data.id as string, { ...data });
        return data;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const next = { ...licenses.get(where.id)!, ...data };
        licenses.set(where.id, next);
        return next;
      }),
    },

    // Mesma semântica da chave única [sellerType, sellerId, provider]: escola e
    // professor nunca colidem na mesma conta, mesmo com o mesmo provider.
    sellerAccount: {
      upsert: vi.fn().mockImplementation(async ({ where }: { where: { sellerType_sellerId_provider: { sellerType: string; sellerId: string; provider: string } } }) => {
        const key = Object.values(where.sellerType_sellerId_provider).join(":");
        const existing = sellerAccounts.get(key);
        if (existing) return existing;
        const created = { id: `acc-${sellerAccounts.size + 1}`, ...where.sellerType_sellerId_provider };
        sellerAccounts.set(key, created);
        return created;
      }),
    },

    sellerLedgerEntry: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        ledger.push({ ...data });
        return data;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { purchaseId: string; type: string } }) =>
        ledger.find((e) => e.purchaseId === where.purchaseId && e.type === where.type) ?? null),
    },

    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    trainingProductAudience: { findFirst: vi.fn().mockResolvedValue(null) },
  };

  return {
    db: Object.assign(db, {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    }),
    ledger,
    sellerAccounts,
    accountById: (id: string) => [...sellerAccounts.values()].find((a) => a.id === id),
  };
}

function checkoutCompletedEvent(purchaseId: string, versionId: string, productId: string) {
  return {
    id: `evt-${purchaseId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "checkout:athlete-1:idem-1",
        amount_total: PRICE,
        currency: "brl",
        payment_status: "paid",
        payment_intent: "pi_123",
        metadata: { productId, versionId, athleteId: "athlete-1", purchaseId },
      },
    },
  } as never;
}

/**
 * Evento `refund.created` já verificado, como o `RefundTrainingPurchase`
 * recebe em produção: o vínculo com a nossa compra é o `payment_intent`,
 * nunca um id vindo do cliente.
 */
function refundCreatedEvent(id: string) {
  return {
    id: `evt-${id}`,
    type: "refund.created",
    data: { object: { id, payment_intent: "pi_123" } },
  } as never;
}

/** Percorre checkout pago -> webhook verificado e devolve o ledger resultante. */
async function sellThrough(product: Record<string, unknown>) {
  const ctx = makeDb(product);
  const provider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" }) };

  const checkout = await new CreateMarketplaceCheckout(ctx.db as never, () => NOW, provider)
    .execute("athlete-1", { productId: product.id as string, idempotencyKey: "idem-1" });
  if (checkout.kind !== "paid") throw new Error("esperava checkout pago");

  await new ConfirmTrainingPurchaseFromWebhook(ctx.db as unknown as PrismaClient, () => NOW)
    .execute(checkoutCompletedEvent(checkout.purchase.id, product.currentVersionId as string, product.id as string));

  return { ...ctx, purchaseId: checkout.purchase.id };
}

beforeEach(() => {
  // A taxa vem da configuração (RF-205), nunca de constante no código.
  vi.stubEnv("MARKETPLACE_PLATFORM_FEE_BPS", "1500");
});

describe("atribuição financeira por titularidade do produto [SAM-9]", () => {
  it("produto da ESCOLA: venda credita a SellerAccount da escola, nunca de um professor", async () => {
    const ctx = await sellThrough(SCHOOL_PRODUCT);

    expect(ctx.db.sellerAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerType_sellerId_provider: { sellerType: "SCHOOL", sellerId: "school-1", provider: "stripe" } },
    }));

    const sale = ctx.ledger.find((e) => e.type === "SALE")!;
    expect(sale).toMatchObject({ grossAmount: PRICE, feeAmount: 749, netAmount: PRICE - 749 });
    expect(ctx.accountById(sale.sellerAccountId as string)).toMatchObject({ sellerType: "SCHOOL", sellerId: "school-1" });

    // Nenhuma conta de professor é sequer criada por uma venda da escola.
    const types = [...ctx.sellerAccounts.values()].map((a) => a.sellerType);
    expect(types).toEqual(["SCHOOL"]);
  });

  it("produto de PROFESSOR: segue creditando o professor (sem regressão)", async () => {
    const ctx = await sellThrough(COACH_PRODUCT);

    expect(ctx.db.sellerAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerType_sellerId_provider: { sellerType: "COACH", sellerId: "coach-1", provider: "stripe" } },
    }));

    const sale = ctx.ledger.find((e) => e.type === "SALE")!;
    expect(ctx.accountById(sale.sellerAccountId as string)).toMatchObject({ sellerType: "COACH", sellerId: "coach-1" });
    expect([...ctx.sellerAccounts.values()].map((a) => a.sellerType)).toEqual(["COACH"]);
  });

  it("a taxa da plataforma é idêntica para escola e professor — o tipo de vendedor não muda o cálculo", async () => {
    const school = await sellThrough(SCHOOL_PRODUCT);
    const coach = await sellThrough(COACH_PRODUCT);

    const feeOf = (ctx: { ledger: Array<Record<string, unknown>> }) => {
      const sale = ctx.ledger.find((e) => e.type === "SALE")!;
      return { fee: sale.feeAmount, net: sale.netAmount, gross: sale.grossAmount };
    };
    expect(feeOf(school)).toEqual(feeOf(coach));
  });

  it("reembolso de produto da ESCOLA reverte na conta da escola e não toca em conta de professor", async () => {
    const ctx = await sellThrough(SCHOOL_PRODUCT);
    const sale = ctx.ledger.find((e) => e.type === "SALE")!;

    await new RefundTrainingPurchase(ctx.db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundCreatedEvent("re_1") });

    const refund = ctx.ledger.find((e) => e.type === "REFUND")!;
    // Espelha exatamente a venda, no MESMO sellerAccountId — é isso que garante
    // que o estorno não pode cair no bolso errado.
    expect(refund.sellerAccountId).toBe(sale.sellerAccountId);
    expect(refund).toMatchObject({
      grossAmount: -(sale.grossAmount as number),
      feeAmount: -(sale.feeAmount as number),
      netAmount: -(sale.netAmount as number),
    });
    expect(ctx.accountById(refund.sellerAccountId as string)).toMatchObject({ sellerType: "SCHOOL" });
    expect([...ctx.sellerAccounts.values()].map((a) => a.sellerType)).toEqual(["SCHOOL"]);

    // Posição líquida da escola volta a zero; o histórico permanece (2 linhas).
    const net = ctx.ledger.reduce((sum, e) => sum + (e.netAmount as number), 0);
    expect(net).toBe(0);
    expect(ctx.ledger).toHaveLength(2);
  });

  it("reembolso de produto de PROFESSOR reverte na conta do professor", async () => {
    const ctx = await sellThrough(COACH_PRODUCT);
    const sale = ctx.ledger.find((e) => e.type === "SALE")!;

    await new RefundTrainingPurchase(ctx.db as unknown as PrismaClient, () => NOW)
      .execute({ kind: "provider_event", event: refundCreatedEvent("re_2") });

    const refund = ctx.ledger.find((e) => e.type === "REFUND")!;
    expect(refund.sellerAccountId).toBe(sale.sellerAccountId);
    expect(ctx.accountById(refund.sellerAccountId as string)).toMatchObject({ sellerType: "COACH" });
    expect([...ctx.sellerAccounts.values()].map((a) => a.sellerType)).toEqual(["COACH"]);
  });

  it("o vendedor é congelado no offerSnapshot do checkout, não relido do produto na confirmação", async () => {
    const ctx = await sellThrough(SCHOOL_PRODUCT);
    const created = (ctx.db.trainingPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(created.offerSnapshot).toMatchObject({ sellerType: "SCHOOL", sellerId: "school-1", price: PRICE });
  });
});
