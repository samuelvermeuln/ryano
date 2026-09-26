/**
 * TM039 — CreateMarketplaceCheckout: POST /api/marketplace/checkout's use
 * case (RF-108). Free products delegate to AcquireFreeTrainingProduct and
 * return a license immediately; paid products only ever get a PENDING
 * purchase with a frozen offerSnapshot — this use case must NEVER promote a
 * purchase to COMPLETED (that's TM060/TM062, Onda 2, a verified-webhook-only
 * path per RF-202).
 */
import { describe, expect, it, vi } from "vitest";
import { CreateMarketplaceCheckout } from "@/modules/school/application/create-marketplace-checkout";

const now = new Date("2026-09-23T12:00:00Z");

function withTx<T extends Record<string, Record<string, unknown>>>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    ),
  });
}

function makeDb(over: Record<string, unknown> = {}) {
  const purchases = new Map<string, Record<string, unknown>>();
  const licenses = new Map<string, Record<string, unknown>>();

  const db = {
    trainingProduct: {
      findUnique: vi.fn().mockResolvedValue({
        id: "prod-free", status: "PUBLISHED", priceCents: null, currency: null, currentVersionId: "ver-1",
      }),
    },
    trainingPurchase: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { checkoutId: string } }) => {
        for (const p of purchases.values()) if (p.checkoutId === where.checkoutId) return p;
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        for (const p of purchases.values()) {
          if (p.checkoutId === data.checkoutId) {
            const err = new Error("Unique constraint failed on the fields: (`checkoutId`)");
            (err as unknown as { code: string }).code = "P2002";
            throw err;
          }
        }
        purchases.set(data.id as string, data);
        return data;
      }),
    },
    schoolAthleteMembership: {
      // Fixtures use PUBLIC/no-visibility products; assertProductPurchasable
      // (TM058) short-circuits before ever calling this for a non-SCHOOL_ONLY product.
      findFirst: vi.fn().mockResolvedValue(null),
    },
    trainingProductAudience: {
      // Same reasoning: only consulted for PRIVATE products, which these fixtures never use.
      findFirst: vi.fn().mockResolvedValue(null),
    },
    trainingLicense: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { purchaseId: string } }) => {
        for (const l of licenses.values()) if (l.purchaseId === where.purchaseId) return l;
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        licenses.set(data.id as string, data);
        return data;
      }),
    },
    ...over,
  };
  return withTx(db);
}

describe("CreateMarketplaceCheckout [TM039]", () => {
  it("produto grátis: delega a AcquireFreeTrainingProduct e retorna licença imediata", async () => {
    const db = makeDb();
    const out = await new CreateMarketplaceCheckout(db, () => now)
      .execute("athlete-1", { productId: "prod-free", idempotencyKey: "key-1" });
    expect(out.kind).toBe("free");
    expect("license" in out && out.license).toBeTruthy();
    expect(db.trainingPurchase.create).toHaveBeenCalledTimes(1);
    const created = (db.trainingPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(created.status).toBe("COMPLETED");
  });

  it("produto pago: cria PENDING com offerSnapshot congelado, nunca COMPLETED", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-paid", title: "Plano pago", status: "PUBLISHED", priceCents: 4990, currency: "BRL", currentVersionId: "ver-2",
        }),
      },
    });
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/x" }) };
    const out = await new CreateMarketplaceCheckout(db, () => now, mockProvider)
      .execute("athlete-1", { productId: "prod-paid", idempotencyKey: "key-2" });
    expect(out.kind).toBe("paid");
    expect("purchase" in out && out.purchase.status).toBe("PENDING");
    expect(db.trainingLicense.create).not.toHaveBeenCalled();
    const created = (db.trainingPurchase.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(created.status).toBe("PENDING");
    expect(created.offerSnapshot).toMatchObject({ price: 4990, currency: "BRL", versionId: "ver-2" });
  });

  it("idempotencyKey obrigatório", async () => {
    const db = makeDb();
    await expect(new CreateMarketplaceCheckout(db, () => now).execute("athlete-1", { productId: "prod-free" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("produto pago: reenvio com o mesmo idempotencyKey não cria segunda compra", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-paid", title: "Plano pago", status: "PUBLISHED", priceCents: 4990, currency: "BRL", currentVersionId: "ver-2",
        }),
      },
    });
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/x" }) };
    const usecase = new CreateMarketplaceCheckout(db, () => now, mockProvider);
    const first = await usecase.execute("athlete-1", { productId: "prod-paid", idempotencyKey: "key-3" });
    const second = await usecase.execute("athlete-1", { productId: "prod-paid", idempotencyKey: "key-3" });
    expect("purchase" in first && "purchase" in second && first.purchase.id).toBe(
      "purchase" in second ? second.purchase.id : undefined,
    );
    expect(db.trainingPurchase.create).toHaveBeenCalledTimes(1);
  });

  it("produto grátis: reenvio com idempotencyKey diferente ainda é idempotente por (productId, athleteId)", async () => {
    // AcquireFreeTrainingProduct's own idempotency is by (productId, athleteId),
    // not by idempotencyKey — the checkout use case must not break that.
    const db = makeDb();
    const usecase = new CreateMarketplaceCheckout(db, () => now);
    const first = await usecase.execute("athlete-1", { productId: "prod-free", idempotencyKey: "key-a" });
    const second = await usecase.execute("athlete-1", { productId: "prod-free", idempotencyKey: "key-b" });
    expect("license" in first && "license" in second && first.license.id).toBe(
      "license" in second ? second.license.id : undefined,
    );
    expect(db.trainingPurchase.create).toHaveBeenCalledTimes(1);
  });

  it("produto pago: chama o provedor com o preço do SERVIDOR (nunca o do cliente) e retorna checkoutUrl [TM062]", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-paid", title: "Plano pago", status: "PUBLISHED", priceCents: 4990, currency: "BRL", currentVersionId: "ver-2",
        }),
      },
    });
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }) };
    // Client tries to send a divergent price — CreateMarketplaceCheckoutInput
    // has no price field at all, so this is structurally impossible, not
    // just validated away; asserting the provider call uses the server value.
    const out = await new CreateMarketplaceCheckout(db, () => now, mockProvider)
      .execute("athlete-1", { productId: "prod-paid", idempotencyKey: "key-4" });
    expect("checkoutUrl" in out && out.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(mockProvider.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 4990, currency: "BRL" }));
  });

  it("produto pago: licença NUNCA é ativada diretamente pela resposta do checkout [TM062]", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-paid", title: "Plano pago", status: "PUBLISHED", priceCents: 4990, currency: "BRL", currentVersionId: "ver-2",
        }),
      },
    });
    const mockProvider = { createCheckoutSession: vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/x" }) };
    await new CreateMarketplaceCheckout(db, () => now, mockProvider)
      .execute("athlete-1", { productId: "prod-paid", idempotencyKey: "key-5" });
    expect(db.trainingLicense.create).not.toHaveBeenCalled();
  });
});
