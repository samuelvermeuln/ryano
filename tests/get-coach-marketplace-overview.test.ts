/**
 * GetCoachMarketplaceOverview — seller panel for `/professor/[schoolId]/marketplace`.
 *
 * Focus on the invariants that are easy to get wrong and expensive when wrong:
 * money must come from the ledger (never from summing purchase prices), refunds
 * must already be netted out, the coach's personal catalogue must not absorb a
 * school's products, and "no views yet" must not be reported as 0% conversion.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GetCoachMarketplaceOverview } from "@/modules/school/application/get-coach-marketplace-overview";

const NOW = new Date("2026-09-17T12:00:00.000Z");

function makeDb(over: Record<string, unknown> = {}) {
  return {
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }),
    },
    trainingProduct: {
      findMany: vi.fn().mockResolvedValue([
        { id: "prod-1", title: "Base de corrida", status: "PUBLISHED", visibility: "PUBLIC", priceCents: 9900, currency: "BRL", updatedAt: NOW },
        { id: "prod-2", title: "Rascunho", status: "DRAFT", visibility: "PUBLIC", priceCents: null, currency: null, updatedAt: NOW },
      ]),
    },
    trainingPurchase: {
      groupBy: vi.fn().mockResolvedValue([
        { productId: "prod-1", status: "COMPLETED", _count: { _all: 4 } },
        { productId: "prod-1", status: "REFUNDED", _count: { _all: 1 } },
      ]),
    },
    trainingLicense: {
      groupBy: vi.fn().mockResolvedValue([{ productId: "prod-1", _count: { _all: 3 } }]),
    },
    trainingProductViewDaily: {
      findMany: vi.fn().mockResolvedValue([
        { productId: "prod-1", day: "2026-09-16", views: 100, anonViews: 60 },
      ]),
    },
    sellerAccount: {
      findFirst: vi.fn().mockResolvedValue({ provider: "stripe", kycStatus: "VERIFIED", payoutAccountRef: "acct_123" }),
    },
    sellerLedgerEntry: {
      findMany: vi.fn().mockResolvedValue([
        // 4 sales of R$99,00 with a 15% fee…
        ...Array.from({ length: 4 }, () => ({
          grossAmount: 9900, feeAmount: 1485, netAmount: 8415,
          currency: "BRL", type: "SALE", purchase: { productId: "prod-1" },
        })),
        // …and one refund stored as the exact negative mirror (TM067).
        { grossAmount: -9900, feeAmount: -1485, netAmount: -8415, currency: "BRL", type: "REFUND", purchase: { productId: "prod-1" } },
      ]),
    },
    ...over,
  } as unknown as PrismaClient;
}

describe("GetCoachMarketplaceOverview", () => {
  it("soma dinheiro pelo ledger, já líquido de reembolsos", async () => {
    const overview = await new GetCoachMarketplaceOverview(makeDb()).execute({ actorUserId: "user-1" });

    // 4 vendas - 1 reembolso = 3 efetivas. O reembolso é o espelho negativo,
    // então a soma direta já dá a posição atual.
    expect(overview.money.grossCents).toBe(9900 * 3);
    expect(overview.money.netCents).toBe(8415 * 3);
    expect(overview.money.feeCents).toBe(1485 * 3);
    expect(overview.money.currency).toBe("BRL");
  });

  it("ignora entradas PAYOUT no cálculo de receita", async () => {
    const db = makeDb({
      sellerLedgerEntry: {
        findMany: vi.fn().mockResolvedValue([
          { grossAmount: 9900, feeAmount: 1485, netAmount: 8415, currency: "BRL", type: "SALE", purchase: { productId: "prod-1" } },
          // Um repasse move dinheiro para fora, mas não é receita nova: contá-lo
          // faria o painel dobrar a venda que o originou.
          { grossAmount: -8415, feeAmount: 0, netAmount: -8415, currency: "BRL", type: "PAYOUT", purchase: { productId: "prod-1" } },
        ]),
      },
    });
    const overview = await new GetCoachMarketplaceOverview(db).execute({ actorUserId: "user-1" });

    expect(overview.money.grossCents).toBe(9900);
    expect(overview.money.netCents).toBe(8415);
  });

  it("conversão é null sem visitas, e não 0%", async () => {
    const overview = await new GetCoachMarketplaceOverview(makeDb()).execute({ actorUserId: "user-1" });

    const publicado = overview.rows.find((row) => row.id === "prod-1")!;
    const rascunho = overview.rows.find((row) => row.id === "prod-2")!;

    expect(publicado.conversionPct).toBeCloseTo(4); // 4 compras / 100 visitas
    // Sem visitas o desempenho é desconhecido, não ruim.
    expect(rascunho.conversionPct).toBeNull();
    expect(rascunho.totalViews).toBe(0);
  });

  it("consulta apenas produtos do próprio professor, nunca os da escola", async () => {
    const db = makeDb();
    await new GetCoachMarketplaceOverview(db).execute({ actorUserId: "user-1" });

    // A receita da escola vive em outro SellerAccount; misturar aqui
    // apresentaria o faturamento da escola como ganho do professor.
    const where = (db.trainingProduct.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where).toEqual({ coachId: "coach-1" });
    expect(JSON.stringify(where)).not.toContain("schoolId");
  });

  it("consulta o ledger do vendedor COACH, não o da escola", async () => {
    const db = makeDb();
    await new GetCoachMarketplaceOverview(db).execute({ actorUserId: "user-1" });

    const where = (db.sellerAccount.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where).toMatchObject({ sellerType: "COACH", sellerId: "coach-1" });
  });

  it("distingue ausência de conta de repasse de conta sem KYC", async () => {
    const semConta = makeDb({ sellerAccount: { findFirst: vi.fn().mockResolvedValue(null) } });
    expect((await new GetCoachMarketplaceOverview(semConta).execute({ actorUserId: "user-1" })).payout).toBeNull();

    const semRef = makeDb({
      sellerAccount: { findFirst: vi.fn().mockResolvedValue({ provider: "stripe", kycStatus: "PENDING", payoutAccountRef: null }) },
    });
    expect((await new GetCoachMarketplaceOverview(semRef).execute({ actorUserId: "user-1" })).payout).toEqual({
      provider: "stripe",
      kycStatus: "PENDING",
      hasPayoutAccount: false,
    });
  });

  it("professor sem produtos recebe resposta válida, não erro", async () => {
    const db = makeDb({
      trainingProduct: { findMany: vi.fn().mockResolvedValue([]) },
      trainingPurchase: { groupBy: vi.fn() },
      trainingLicense: { groupBy: vi.fn() },
      sellerLedgerEntry: { findMany: vi.fn() },
      trainingProductViewDaily: { findMany: vi.fn() },
    });
    const overview = await new GetCoachMarketplaceOverview(db).execute({ actorUserId: "user-1" });

    expect(overview.rows).toEqual([]);
    expect(overview.products.total).toBe(0);
    expect(overview.money.currency).toBe("BRL");
    // Sem produtos não se consulta compra/licença/ledger: um IN vazio é
    // trabalho garantidamente inútil no banco.
    expect(db.trainingPurchase.groupBy).not.toHaveBeenCalled();
    expect(db.sellerLedgerEntry.findMany).not.toHaveBeenCalled();
  });

  it("recusa professor inexistente ou inativo", async () => {
    const semPerfil = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(new GetCoachMarketplaceOverview(semPerfil).execute({ actorUserId: "user-1" }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });

    const inativo = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "SUSPENDED" }) } });
    await expect(new GetCoachMarketplaceOverview(inativo).execute({ actorUserId: "user-1" }))
      .rejects.toMatchObject({ code: "COACH_INACTIVE", status: 403 });
  });

  it("atribui receita ao produto certo quando há vários", async () => {
    const db = makeDb({
      sellerLedgerEntry: {
        findMany: vi.fn().mockResolvedValue([
          { grossAmount: 9900, feeAmount: 1485, netAmount: 8415, currency: "BRL", type: "SALE", purchase: { productId: "prod-1" } },
          { grossAmount: 5000, feeAmount: 750, netAmount: 4250, currency: "BRL", type: "SALE", purchase: { productId: "prod-2" } },
        ]),
      },
    });
    const overview = await new GetCoachMarketplaceOverview(db).execute({ actorUserId: "user-1" });

    expect(overview.rows.find((row) => row.id === "prod-1")!.netCents).toBe(8415);
    expect(overview.rows.find((row) => row.id === "prod-2")!.netCents).toBe(4250);
    expect(overview.money.netCents).toBe(8415 + 4250);
  });

  it("nunca expõe a identidade de um comprador", async () => {
    const overview = await new GetCoachMarketplaceOverview(makeDb()).execute({ actorUserId: "user-1" });

    // RF-104: o painel do vendedor é agregado. Um athleteId aqui seria
    // vazamento de quem comprou.
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain("athleteId");
    expect(serialized).not.toContain("buyer");
  });
});
