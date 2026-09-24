/**
 * TM032 — GetMarketplaceProductDetail (`GET /api/marketplace/products/[idDoTreino]`, public/no-session).
 *
 * Foco: DRAFT/ARCHIVED/SCHOOL_ONLY nunca vazam para um chamador anônimo
 * (mesmo código/mensagem de "não existe" — RNF-001), o DTO nunca inclui o
 * plano inteiro (só a primeira semana), e UNLISTED é acessível por lookup
 * direto (o único jeito de chegar aqui).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  GetMarketplaceProductDetail,
} from "@/modules/school/application/get-marketplace-product-detail";
import { SchoolError } from "@/modules/school/domain/errors";

function makeDb(overrides: {
  product?: unknown;
  productBySlug?: unknown;
  version?: unknown;
  media?: unknown[];
  reviewAgg?: unknown;
  coach?: unknown;
  school?: unknown;
  templates?: unknown[];
} = {}) {
  const findUniqueMock = vi.fn(async (args: { where: { id?: string; slug?: string } }) => {
    if (args.where.id) return overrides.product ?? null;
    if (args.where.slug) return overrides.productBySlug ?? null;
    return null;
  });

  return {
    trainingProduct: { findUnique: findUniqueMock },
    trainingProductVersion: { findUnique: vi.fn().mockResolvedValue(overrides.version ?? null) },
    marketplaceMedia: { findMany: vi.fn().mockResolvedValue(overrides.media ?? []) },
    marketplaceReview: {
      aggregate: vi.fn().mockResolvedValue(overrides.reviewAgg ?? { _avg: { stars: null }, _count: { _all: 0 } }),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(overrides.coach ?? null) },
    school: { findUnique: vi.fn().mockResolvedValue(overrides.school ?? null) },
    workoutTemplate: { findMany: vi.fn().mockResolvedValue(overrides.templates ?? []) },
  } as unknown as PrismaClient;
}

const publishedProduct = {
  id: "p1", schoolId: null, coachId: "coach-1", slug: "plano-1", title: "Plano 1",
  description: "desc", objective: "ficar mais rápido", difficulty: "beginner",
  goalType: "finish-race", targetEventType: "5k", targetDistance: "5k", sportType: "run",
  durationWeeks: 8, sessionsPerWeek: 3, sessionDurationMin: 30, sessionDurationMax: 60,
  equipment: "tênis", language: "pt", availability: null, sellerPolicyVersion: "v1",
  priceCents: null, currency: null, currentVersionId: "v1", previewVersionId: null,
  status: "PUBLISHED", visibility: "PUBLIC",
};

const v1Version = {
  id: "v1", schemaVersion: 1,
  planPayload: { weeks: [{ week: 1, days: [{ workoutTemplateId: "t1", dayOfWeek: 1, note: "leve" }] }, { week: 2, days: [{ workoutTemplateId: "t2", dayOfWeek: 1 }] }] },
};

const v2Version = {
  id: "v2", schemaVersion: 2,
  planPayload: {
    weeks: [{
      week: 1,
      days: [{
        dayOfWeek: 1,
        sessions: [
          { planSessionId: "s1", workoutTemplateId: "t1", sportType: "run", order: 0 },
          { planSessionId: "s2", workoutTemplateId: "t2", sportType: "gym", order: 1 },
        ],
      }],
    }],
  },
};

describe("GetMarketplaceProductDetail [TM032]", () => {
  it("id inexistente responde PRODUCT_VISIBILITY_DENIED (404), sem vazar existência", async () => {
    const db = makeDb();
    await expect(new GetMarketplaceProductDetail(db).execute({ idOrSlug: "nope" }))
      .rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED", status: 404 });
  });

  it("produto DRAFT responde o MESMO código de 'não existe' — RNF-001", async () => {
    const db = makeDb({ product: { ...publishedProduct, status: "DRAFT" } });
    let error: unknown;
    try {
      await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SchoolError);
    expect((error as SchoolError).code).toBe("PRODUCT_VISIBILITY_DENIED");
  });

  it("produto ARCHIVED nunca é retornado a chamador anônimo", async () => {
    const db = makeDb({ product: { ...publishedProduct, status: "ARCHIVED" } });
    await expect(new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" }))
      .rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED" });
  });

  it("produto SCHOOL_ONLY nunca é retornado a chamador anônimo", async () => {
    const db = makeDb({ product: { ...publishedProduct, visibility: "SCHOOL_ONLY" }, version: v1Version });
    await expect(new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" }))
      .rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED" });
  });

  it("produto UNLISTED É retornado por lookup direto de id (só não aparece em listagem)", async () => {
    const db = makeDb({ product: { ...publishedProduct, visibility: "UNLISTED" }, version: v1Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.id).toBe("p1");
  });

  it("busca por slug quando o id direto não é encontrado", async () => {
    const db = makeDb({ productBySlug: publishedProduct, version: v1Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "plano-1" });
    expect(out.id).toBe("p1");
  });

  it("produto publicado sem currentVersionId responde 404 seguro (nunca 500)", async () => {
    const db = makeDb({ product: { ...publishedProduct, currentVersionId: null } });
    await expect(new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" }))
      .rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED" });
  });

  it("DTO nunca inclui o plano inteiro — só a primeira semana (v1 legado)", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version, templates: [{ id: "t1", title: "Rodagem leve", description: null, sportType: "run" }] });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.previewWeeks).toHaveLength(1);
    expect(out.previewWeeks[0]?.week).toBe(1);
    expect(out.previewWeeks[0]?.days[0]?.sessions[0]?.workoutTemplate?.title).toBe("Rodagem leve");
    // A segunda semana do plano (week 2) NUNCA aparece no DTO.
    expect(JSON.stringify(out.previewWeeks)).not.toContain("t2");
  });

  it("DTO nunca inclui o plano inteiro — só a primeira semana (v2 multimodal)", async () => {
    const db = makeDb({ product: { ...publishedProduct, currentVersionId: "v2" }, version: v2Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.previewWeeks).toHaveLength(1);
    expect(out.previewWeeks[0]?.days[0]?.sessions).toHaveLength(2);
    expect(out.previewWeeks[0]?.days[0]?.sessions.map((s) => s.sportType)).toEqual(["run", "gym"]);
  });

  it("previewVersionId, quando presente, é a fonte da amostra em vez da versão atual", async () => {
    const previewOnly = { id: "preview-1", schemaVersion: 1, planPayload: { weeks: [{ week: 1, days: [{ workoutTemplateId: "t9", dayOfWeek: 1 }] }] } };
    const db = {
      trainingProduct: { findUnique: vi.fn().mockResolvedValue({ ...publishedProduct, previewVersionId: "preview-1" }) },
      trainingProductVersion: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          args.where.id === "preview-1" ? previewOnly : v1Version),
      },
      marketplaceMedia: { findMany: vi.fn().mockResolvedValue([]) },
      marketplaceReview: { aggregate: vi.fn().mockResolvedValue({ _avg: { stars: null }, _count: { _all: 0 } }) },
      coachProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      school: { findUnique: vi.fn().mockResolvedValue(null) },
      workoutTemplate: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(JSON.stringify(out.previewWeeks)).not.toContain("t1");
  });

  it("sem reviews aprovadas: ratingAverage=null e reviewCount=0 (nunca '0 estrelas')", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.ratingAverage).toBeNull();
    expect(out.reviewCount).toBe(0);
  });

  it("com reviews aprovadas: ratingAverage e reviewCount vêm da agregação", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version, reviewAgg: { _avg: { stars: 4.6 }, _count: { _all: 12 } } });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.ratingAverage).toBe(4.6);
    expect(out.reviewCount).toBe(12);
  });

  it("autor coach resolvido com displayName/bio; seller espelha author (Q3/TM019 pendente)", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version, coach: { id: "coach-1", displayName: "Coach Ana", bio: "bio" } });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.author).toEqual({ kind: "coach", id: "coach-1", name: "Coach Ana", bio: "bio" });
    expect(out.seller).toEqual(out.author);
  });

  it("produto grátis (priceCents=null) retorna price=null", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.price).toBeNull();
  });

  it("produto pago retorna price com amountCents/currency", async () => {
    const db = makeDb({ product: { ...publishedProduct, priceCents: 4990, currency: "BRL" }, version: v1Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.price).toEqual({ amountCents: 4990, currency: "BRL" });
  });

  it("só mídia PUBLIC/PREVIEW e READY é retornada (never PRIVATE) — filtro checado na query", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version });
    await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect((db.marketplaceMedia.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ access: { in: ["PUBLIC", "PREVIEW"] }, processingStatus: "READY" }),
      }),
    );
  });

  it("coachingIncluded é sempre false — sem campo no schema para derivar honestamente", async () => {
    const db = makeDb({ product: publishedProduct, version: v1Version });
    const out = await new GetMarketplaceProductDetail(db).execute({ idOrSlug: "p1" });
    expect(out.coachingIncluded).toBe(false);
  });
});
