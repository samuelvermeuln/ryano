/**
 * TM002 — CreateTrainingPurchase: ordem compra→licença dentro da transação.
 *
 * `TrainingLicense.purchaseId` é FK para `TrainingPurchase.id`; a compra
 * precisa ser criada (e aguardada) antes da licença, na mesma transação.
 */
import { describe, expect, it, vi } from "vitest";
import { CreateTrainingPurchase } from "@/modules/school/application/create-training-purchase";

const now = new Date("2026-09-23T12:00:00Z");

function withTx<T extends Record<string, Record<string, unknown>>>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    ),
  });
}

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    trainingProduct: {
      findUnique: vi.fn().mockResolvedValue({
        id: "prod-1", status: "PUBLISHED", priceCents: null, currency: null, currentVersionId: "ver-1",
      }),
    },
    trainingPurchase: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    trainingLicense: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    ...over,
  };
  return withTx(db);
}

describe("CreateTrainingPurchase [TM002]", () => {
  it("cria a compra e AGUARDA antes de criar a licença (ordem sequencial, não Promise.all)", async () => {
    const order: string[] = [];
    const db = makeDb({
      trainingPurchase: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          order.push("purchase-start");
          await Promise.resolve();
          order.push("purchase-done");
          return data;
        }),
      },
      trainingLicense: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          order.push("license-start");
          return data;
        }),
      },
    });

    await new CreateTrainingPurchase(db, () => now).execute("athlete-1", { productId: "prod-1" });

    expect(order).toEqual(["purchase-start", "purchase-done", "license-start"]);
  });

  it("licença criada referencia o purchaseId da compra recém-criada", async () => {
    const db = makeDb();
    const out = await new CreateTrainingPurchase(db, () => now).execute("athlete-1", { productId: "prod-1" });
    const licenseCreateCall = (db.trainingLicense.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(licenseCreateCall.data.purchaseId).toBe(out.purchase.id);
  });

  it("falha na criação da licença propaga o erro — não retorna licença órfã nem sucesso parcial", async () => {
    const db = makeDb({
      trainingLicense: { create: vi.fn().mockRejectedValue(new Error("db unavailable")) },
    });

    await expect(new CreateTrainingPurchase(db, () => now).execute("athlete-1", { productId: "prod-1" }))
      .rejects.toThrow("db unavailable");

    // A compra foi tentada (é chamada antes), mas o `$transaction` real faz
    // rollback de tudo quando o callback lança — aqui garantimos que o caso
    // de uso não engole o erro nem devolve um resultado parcial.
    expect(db.trainingPurchase.create).toHaveBeenCalledTimes(1);
    expect(db.trainingLicense.create).toHaveBeenCalledTimes(1);
  });

  it("produto pago sem paymentRef é rejeitado antes de qualquer escrita", async () => {
    const db = makeDb({
      trainingProduct: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-2", status: "PUBLISHED", priceCents: 4990, currency: "BRL", currentVersionId: "ver-1",
        }),
      },
    });
    await expect(new CreateTrainingPurchase(db, () => now).execute("athlete-1", { productId: "prod-2" }))
      .rejects.toMatchObject({ code: "PAYMENT_REF_REQUIRED" });
    expect(db.trainingPurchase.create).not.toHaveBeenCalled();
  });
});
