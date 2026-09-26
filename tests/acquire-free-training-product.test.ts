/**
 * TM038 — AcquireFreeTrainingProduct: free-only acquisition split out of
 * CreateTrainingPurchase (design D-02, RF-108).
 *
 * Focus: idempotency per (productId, athleteId) across retry/double-tab and
 * genuine create-race, sequential purchase→license order (RF-002 discipline
 * preserved), and rejection of paid products.
 */
import { describe, expect, it, vi } from "vitest";
import { AcquireFreeTrainingProduct } from "@/modules/school/application/acquire-free-training-product";

const now = new Date("2026-09-23T12:00:00Z");

function withTx<T extends Record<string, Record<string, unknown>>>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    ),
  });
}

/** In-memory purchase/license store so repeated .execute() calls behave like a real DB across the test. */
function makeDb(over: Record<string, unknown> = {}) {
  const purchases = new Map<string, { id: string; productId: string; athleteId: string; status: string; purchasedAt: Date; checkoutId: string }>();
  const licenses = new Map<string, { id: string; productId: string; versionId: string; athleteId: string; status: string; startedAt: Date | null; purchaseId: string }>();

  const db = {
    trainingProduct: {
      findUnique: vi.fn().mockResolvedValue({
        id: "prod-1", status: "PUBLISHED", priceCents: null, currency: null, currentVersionId: "ver-1",
      }),
    },
    trainingPurchase: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { checkoutId: string } }) => {
        for (const p of purchases.values()) if (p.checkoutId === where.checkoutId) return p;
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = data as unknown as { id: string; checkoutId: string };
        for (const p of purchases.values()) {
          if (p.checkoutId === row.checkoutId) {
            const err = new Error("Unique constraint failed on the fields: (`checkoutId`)");
            (err as unknown as { code: string }).code = "P2002";
            throw err;
          }
        }
        purchases.set(row.id, data as never);
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
        const row = data as unknown as { id: string };
        licenses.set(row.id, data as never);
        return data;
      }),
    },
    ...over,
  };
  return withTx(db);
}

describe("AcquireFreeTrainingProduct [TM038]", () => {
  it("cria a compra e AGUARDA antes de criar a licença (ordem sequencial)", async () => {
    const order: string[] = [];
    const db = makeDb();
    db.trainingPurchase.create = vi.fn().mockImplementation(async ({ data }) => {
      order.push("purchase-start");
      await Promise.resolve();
      order.push("purchase-done");
      return data;
    });
    db.trainingLicense.create = vi.fn().mockImplementation(async ({ data }) => {
      order.push("license-start");
      return data;
    });

    await new AcquireFreeTrainingProduct(db, () => now).execute("athlete-1", { productId: "prod-1" });

    expect(order).toEqual(["purchase-start", "purchase-done", "license-start"]);
  });

  it("licença referencia o purchaseId da compra recém-criada", async () => {
    const db = makeDb();
    const out = await new AcquireFreeTrainingProduct(db, () => now).execute("athlete-1", { productId: "prod-1" });
    expect(out.license.productId).toBe("prod-1");
    const licenseCreateCall = (db.trainingLicense.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(licenseCreateCall.data.purchaseId).toBe(out.purchase.id);
    expect(out.alreadyAcquired).toBe(false);
  });

  it("retry/dupla aba: segunda execução não cria segunda compra nem segunda licença", async () => {
    const db = makeDb();
    const usecase = new AcquireFreeTrainingProduct(db, () => now);

    const first = await usecase.execute("athlete-1", { productId: "prod-1" });
    const second = await usecase.execute("athlete-1", { productId: "prod-1" });

    expect(second.alreadyAcquired).toBe(true);
    expect(second.purchase.id).toBe(first.purchase.id);
    expect(second.license.id).toBe(first.license.id);
    expect(db.trainingPurchase.create).toHaveBeenCalledTimes(1);
    expect(db.trainingLicense.create).toHaveBeenCalledTimes(1);
  });

  it("corrida real (create perde por unique constraint) devolve a compra vencedora, não duplica", async () => {
    const db = makeDb();
    // Simulate: by the time THIS transaction tries to write, another
    // request already committed the same checkoutId — the pre-create
    // findUnique still misses it (as if read before the winner committed),
    // but create() collides; the post-conflict re-read finds the winner.
    db.trainingPurchase.create = vi.fn().mockImplementation(async () => {
      const err = new Error("Unique constraint failed on the fields: (`checkoutId`)");
      (err as unknown as { code: string }).code = "P2002";
      throw err;
    });
    db.trainingPurchase.findUnique = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "purchase-winner", productId: "prod-1", athleteId: "athlete-1", status: "COMPLETED", purchasedAt: now,
      });
    db.trainingLicense.findFirst = vi.fn().mockResolvedValue({
      id: "license-winner", productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", status: "ACTIVE", startedAt: null,
    });

    const out = await new AcquireFreeTrainingProduct(db, () => now).execute("athlete-1", { productId: "prod-1" });

    expect(out.alreadyAcquired).toBe(true);
    expect(out.purchase.id).toBe("purchase-winner");
    expect(out.license.id).toBe("license-winner");
  });

  it("produto pago é rejeitado (RF-108 é exclusivo de priceCents=null)", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-2", status: "PUBLISHED", priceCents: 4990, currency: "BRL", currentVersionId: "ver-1",
        }),
      },
    });
    await expect(new AcquireFreeTrainingProduct(db, () => now).execute("athlete-1", { productId: "prod-2" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FREE" });
    expect(db.trainingPurchase.create).not.toHaveBeenCalled();
  });

  it("produto não publicado é rejeitado", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-3", status: "DRAFT", priceCents: null, currency: null, currentVersionId: "ver-1",
        }),
      },
    });
    await expect(new AcquireFreeTrainingProduct(db, () => now).execute("athlete-1", { productId: "prod-3" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
  });

  it("produto inexistente responde PRODUCT_NOT_FOUND", async () => {
    const db = makeDb({ trainingProduct: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(new AcquireFreeTrainingProduct(db, () => now).execute("athlete-1", { productId: "nope" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("dois atletas diferentes adquirindo o mesmo produto grátis geram licenças distintas", async () => {
    const db = makeDb();
    const usecase = new AcquireFreeTrainingProduct(db, () => now);
    const a = await usecase.execute("athlete-1", { productId: "prod-1" });
    const b = await usecase.execute("athlete-2", { productId: "prod-1" });
    expect(a.license.id).not.toBe(b.license.id);
    expect(a.purchase.id).not.toBe(b.purchase.id);
  });
});
