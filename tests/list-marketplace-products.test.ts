/**
 * TM031 — ListMarketplaceProducts (`GET /api/marketplace/products`, public/no-session).
 *
 * Same non-negotiable rule as ListTrainingProducts (TM001): `status`/
 * `visibility` cannot be supplied by the caller at all, and the query must
 * always force PUBLISHED+PUBLIC — no filter combination may elevate it.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ListMarketplaceProducts, MarketplaceSort } from "@/modules/school/application/list-marketplace-products";

function makeDb(overrides: {
  products?: unknown[];
  reviewGroups?: unknown[];
  purchaseGroups?: unknown[];
  coaches?: unknown[];
  schools?: unknown[];
  media?: unknown[];
  count?: number;
} = {}) {
  return {
    trainingProduct: {
      findMany: vi.fn().mockResolvedValue(overrides.products ?? []),
      count: vi.fn().mockResolvedValue(overrides.count ?? (overrides.products ?? []).length),
    },
    marketplaceReview: { groupBy: vi.fn().mockResolvedValue(overrides.reviewGroups ?? []) },
    trainingPurchase: { groupBy: vi.fn().mockResolvedValue(overrides.purchaseGroups ?? []) },
    coachProfile: { findMany: vi.fn().mockResolvedValue(overrides.coaches ?? []) },
    school: { findMany: vi.fn().mockResolvedValue(overrides.schools ?? []) },
    marketplaceMedia: { findMany: vi.fn().mockResolvedValue(overrides.media ?? []) },
  } as unknown as PrismaClient;
}

const baseRow = {
  id: "p1", schoolId: null, coachId: "coach-1", slug: "plano-1", title: "Plano 1",
  description: null, sportType: "run", durationWeeks: 8, sessionsPerWeek: 3,
  difficulty: "beginner", goalType: "finish-race", targetEventType: "5k", targetDistance: "5k",
  priceCents: null, currency: null, coverMediaId: null, createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("ListMarketplaceProducts [TM031]", () => {
  it("rejeita `status` vindo do cliente — o parâmetro não existe no schema", async () => {
    await expect(new ListMarketplaceProducts(makeDb()).execute({ status: "DRAFT" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("rejeita `visibility` vindo do cliente — o parâmetro não existe no schema", async () => {
    await expect(new ListMarketplaceProducts(makeDb()).execute({ visibility: "SCHOOL_ONLY" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("sempre consulta status=PUBLISHED e visibility=PUBLIC, sem exceção", async () => {
    const db = makeDb();
    await new ListMarketplaceProducts(db).execute({});
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED", visibility: "PUBLIC" }),
      }),
    );
  });

  it("mantém status/visibility forçados mesmo combinando todos os filtros legítimos", async () => {
    const db = makeDb();
    await new ListMarketplaceProducts(db).execute({
      schoolId: "school-1", coachId: "coach-1", sportType: "run,bike", difficulty: "beginner",
      goal: "finish-race", eventType: "5k", eventDistance: "5k", weeksMin: 4, weeksMax: 12,
      sessionsPerWeek: 3, priceMin: 0, priceMax: 10000, equipment: "tênis", language: "pt",
    });
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED", visibility: "PUBLIC" }),
      }),
    );
  });

  it("rejeita sportType fora da taxonomia canônica RyvanoSportType (RNF-006)", async () => {
    await expect(new ListMarketplaceProducts(makeDb()).execute({ sportType: "not-a-sport" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("sportType multi-seleção vira filtro `in`", async () => {
    const db = makeDb();
    await new ListMarketplaceProducts(db).execute({ sportType: "run,bike" });
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sportType: { in: ["run", "bike"] } }) }),
    );
  });

  it("weeksMin > weeksMax é rejeitado antes de consultar o banco", async () => {
    const db = makeDb();
    await expect(new ListMarketplaceProducts(db).execute({ weeksMin: 12, weeksMax: 4 }))
      .rejects.toBeInstanceOf(Error);
    expect(db.trainingProduct.findMany).not.toHaveBeenCalled();
  });

  it("free=true filtra priceCents=null (gratuito)", async () => {
    const db = makeDb();
    await new ListMarketplaceProducts(db).execute({ free: true });
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ priceCents: null }) }),
    );
  });

  it("priceMin/priceMax vira faixa gte/lte sobre priceCents", async () => {
    const db = makeDb();
    await new ListMarketplaceProducts(db).execute({ priceMin: 1000, priceMax: 5000 });
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ priceCents: { gte: 1000, lte: 5000 } }) }),
    );
  });

  it("minRating restringe a produtos com média aprovada >= filtro", async () => {
    const db = makeDb({
      reviewGroups: [
        { productId: "p1", _avg: { stars: 4.8 }, _count: { _all: 6 } },
        { productId: "p2", _avg: { stars: 3.0 }, _count: { _all: 2 } },
      ],
      products: [baseRow],
    });
    await new ListMarketplaceProducts(db).execute({ minRating: 4 });
    expect(db.marketplaceReview.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ moderationStatus: "APPROVED" }) }),
    );
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["p1"] } }) }),
    );
  });

  it("paginação por cursor e cursor inválido não quebra (reinicia página)", async () => {
    const db = makeDb({ products: [baseRow] });
    const out = await new ListMarketplaceProducts(db).execute({ limit: 1, cursor: "not-base64-json" });
    expect(out.items).toHaveLength(1);
  });

  it("cursor de um sort diferente é ignorado (não corrompe a ordenação)", async () => {
    const db = makeDb({ products: [baseRow] });
    const priceCursor = Buffer.from(JSON.stringify({ mode: "keyset", sort: MarketplaceSort.PRICE_ASC, id: "x" })).toString("base64url");
    const out = await new ListMarketplaceProducts(db).execute({ sort: MarketplaceSort.RECENT, cursor: priceCursor });
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: undefined, skip: 0 }));
    expect(out.items).toHaveLength(1);
  });

  it("produto sem nenhuma review aprovada mostra ratingAverage=null e reviewCount=0 (nunca '0 estrelas')", async () => {
    const db = makeDb({ products: [baseRow], reviewGroups: [] });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]).toMatchObject({ ratingAverage: null, reviewCount: 0 });
  });

  it("totalCount vem de uma contagem real no servidor (RF-105), não do tamanho da página", async () => {
    const db = makeDb({ products: [baseRow], count: 137 });
    const out = await new ListMarketplaceProducts(db).execute({ limit: 1 });
    expect(out.items).toHaveLength(1);
    expect(out.totalCount).toBe(137);
    expect(db.trainingProduct.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PUBLISHED", visibility: "PUBLIC" }) }),
    );
  });

  it("coachingIncluded é sempre false — sem campo no schema para derivar honestamente (RNF-012)", async () => {
    const db = makeDb({ products: [baseRow] });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]?.coachingIncluded).toBe(false);
  });

  it("coverImage usa coverMediaId quando presente entre as mídias PUBLIC/READY", async () => {
    const db = makeDb({
      products: [{ ...baseRow, coverMediaId: "m2" }],
      media: [
        { id: "m1", productId: "p1", storageKey: "k1", altText: "a1" },
        { id: "m2", productId: "p1", storageKey: "k2", altText: "a2" },
      ],
    });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]?.coverImage).toEqual({ storageKey: "k2", altText: "a2" });
  });

  it("coverImage cai para a primeira mídia por sortOrder quando não há coverMediaId", async () => {
    const db = makeDb({
      products: [baseRow],
      media: [{ id: "m1", productId: "p1", storageKey: "k1", altText: "a1" }],
    });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]?.coverImage).toEqual({ storageKey: "k1", altText: "a1" });
  });

  it("coverImage é null quando o produto não tem mídia PUBLIC/READY (nunca quebra a listagem)", async () => {
    const db = makeDb({ products: [baseRow], media: [] });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]?.coverImage).toBeNull();
  });

  it("resolve autor coach por displayName", async () => {
    const db = makeDb({ products: [baseRow], coaches: [{ id: "coach-1", displayName: "Coach Ana" }] });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]?.author).toEqual({ kind: "coach", id: "coach-1", name: "Coach Ana" });
  });

  it("resolve autor escola por name quando coachId é null", async () => {
    const schoolRow = { ...baseRow, id: "p2", coachId: null, schoolId: "school-1" };
    const db = makeDb({ products: [schoolRow], schools: [{ id: "school-1", name: "Escola X" }] });
    const out = await new ListMarketplaceProducts(db).execute({});
    expect(out.items[0]?.author).toEqual({ kind: "school", id: "school-1", name: "Escola X" });
  });

  describe("sort=most-purchased", () => {
    it("conta apenas compras COMPLETED (dado real, não popularidade simulada — RNF-012)", async () => {
      const rowA = { ...baseRow, id: "a" };
      const rowB = { ...baseRow, id: "b" };
      const db = makeDb({
        products: [rowA, rowB],
        purchaseGroups: [{ productId: "b", _count: { _all: 9 } }, { productId: "a", _count: { _all: 2 } }],
      });
      const out = await new ListMarketplaceProducts(db).execute({ sort: MarketplaceSort.MOST_PURCHASED });
      expect(db.trainingPurchase.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: "COMPLETED" }) }),
      );
      expect(out.items.map((i) => i.id)).toEqual(["b", "a"]);
    });
  });

  describe("sort=best-rated", () => {
    it("um produto com 1 nota 5 não ultrapassa um produto com muitas notas 4.9 (RNF-012, ranking ponderado)", async () => {
      const fewReviews = { ...baseRow, id: "few", title: "Poucas avaliações" };
      const manyReviews = { ...baseRow, id: "many", title: "Muitas avaliações" };
      const db = makeDb({
        products: [fewReviews, manyReviews],
        reviewGroups: [
          { productId: "few", _avg: { stars: 5 }, _count: { _all: 1 } },
          { productId: "many", _avg: { stars: 4.9 }, _count: { _all: 50 } },
        ],
      });
      const out = await new ListMarketplaceProducts(db).execute({ sort: MarketplaceSort.BEST_RATED });
      expect(out.items.map((i) => i.id)).toEqual(["many", "few"]);
    });

    it("produtos sem nenhuma review ficam por último", async () => {
      const noReviews = { ...baseRow, id: "none" };
      const rated = { ...baseRow, id: "rated" };
      const db = makeDb({
        products: [noReviews, rated],
        reviewGroups: [{ productId: "rated", _avg: { stars: 4 }, _count: { _all: 3 } }],
      });
      const out = await new ListMarketplaceProducts(db).execute({ sort: MarketplaceSort.BEST_RATED });
      expect(out.items.map((i) => i.id)).toEqual(["rated", "none"]);
    });
  });
});
