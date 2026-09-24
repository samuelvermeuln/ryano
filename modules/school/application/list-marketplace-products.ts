import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TrainingProductStatus, TrainingProductVisibility } from "../domain/enums";
import { isRyvanoSportType, type RyvanoSportType } from "@/modules/shared/activities/sport-types";

/**
 * TM031 — `GET /api/marketplace/products` (public catalog, RF-105/RNF-006).
 *
 * Superset of `ListTrainingProducts` (TM001): the same non-negotiable rule is
 * copied verbatim, not weakened for convenience — `status`/`visibility` are
 * NOT accepted as input at all (`z.strictObject` rejects the keys outright),
 * and the query ALWAYS forces `status=PUBLISHED, visibility=PUBLIC`. This use
 * case has no actor/session concept whatsoever, same as `ListTrainingProducts`
 * — the authenticated "see my own drafts/SCHOOL_ONLY" listing is the separate
 * `GET /api/coach/products` route (TM024–027, a different track), never a
 * parameter on this one.
 *
 * `UNLISTED` products never appear here (the forced visibility filter
 * excludes them) — they are only reachable through
 * `GetMarketplaceProductDetail` (TM032) via a direct id/slug lookup.
 */

export const MarketplaceSort = {
  RELEVANCE: "relevance",
  RECENT: "recent",
  MOST_PURCHASED: "most-purchased",
  BEST_RATED: "best-rated",
  PRICE_ASC: "price-asc",
  PRICE_DESC: "price-desc",
} as const;
export type MarketplaceSort = (typeof MarketplaceSort)[keyof typeof MarketplaceSort];

const sportTypeList = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
  .refine((values) => values.length > 0 && values.every(isRyvanoSportType), {
    message: "sportType must contain only canonical RyvanoSportType values (RNF-006)",
  })
  .transform((values) => values as RyvanoSportType[]);

/**
 * Raw field shape, exported separately from the strict+refined schema below
 * so the HTTP route (TM033) can build `z.strictObject({ ...listMarketplaceProductsShape, <coerced overrides> })`
 * to coerce query-string values (numbers/booleans arrive as strings over
 * HTTP) without redeclaring every field. `execute()` re-validates the
 * coerced result against the full `listMarketplaceProductsSchema` regardless
 * — the route's coercion schema is a convenience, never the source of truth.
 */
export const listMarketplaceProductsShape = {
  q: z.string().trim().min(1).max(200).optional(),
  sportType: sportTypeList.optional(),
  difficulty: z.string().trim().min(1).max(50).optional(),
  goal: z.string().trim().min(1).max(50).optional(),
  eventType: z.string().trim().min(1).max(50).optional(),
  eventDistance: z.string().trim().min(1).max(50).optional(),
  weeksMin: z.number().int().min(1).max(520).optional(),
  weeksMax: z.number().int().min(1).max(520).optional(),
  sessionsPerWeek: z.number().int().min(1).max(50).optional(),
  minRating: z.number().min(1).max(5).optional(),
  priceMin: z.number().int().min(0).optional(),
  priceMax: z.number().int().min(0).optional(),
  /** Gratuito/pago toggle (spec §5.1) — distinct from priceMin/priceMax, which never match `priceCents=null`. */
  free: z.boolean().optional(),
  equipment: z.string().trim().min(1).max(200).optional(),
  language: z.string().trim().min(1).max(10).optional(),
  /** Not an authorization elevator: filtering by owner never bypasses the forced status/visibility below. */
  schoolId: z.string().min(1).optional(),
  coachId: z.string().min(1).optional(),
  sort: z.enum(MarketplaceSort).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(4096).optional(),
};

export const listMarketplaceProductsSchema = z
  .strictObject(listMarketplaceProductsShape)
  .superRefine((v, ctx) => {
    if (v.weeksMin !== undefined && v.weeksMax !== undefined && v.weeksMin > v.weeksMax) {
      ctx.addIssue({ code: "custom", path: ["weeksMax"], message: "weeksMax must be >= weeksMin" });
    }
    if (v.priceMin !== undefined && v.priceMax !== undefined && v.priceMin > v.priceMax) {
      ctx.addIssue({ code: "custom", path: ["priceMax"], message: "priceMax must be >= priceMin" });
    }
  });

export type ListMarketplaceProductsInput = z.infer<typeof listMarketplaceProductsSchema>;

/**
 * HTTP query-string coercion schema (TM033/TM035): values arrive as strings
 * over a URL, so numeric/boolean fields need `z.coerce` overrides. Shared by
 * the route (`app/api/marketplace/products/route.ts`) and the server-rendered
 * catalog page (`app/marketplace/page.tsx`) so both parse a client-supplied
 * query string identically — one source of truth for "what counts as a
 * valid filter", not two schemas that could quietly drift apart. `execute()`
 * re-validates the coerced result against `listMarketplaceProductsSchema`
 * regardless, so this schema is a convenience, never the source of truth for
 * safety.
 */
export const listMarketplaceProductsQuerySchema = z.strictObject({
  ...listMarketplaceProductsShape,
  weeksMin: z.coerce.number().int().min(1).max(520).optional(),
  weeksMax: z.coerce.number().int().min(1).max(520).optional(),
  sessionsPerWeek: z.coerce.number().int().min(1).max(50).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  free: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export interface MarketplaceProductSummary {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  sportTypes: string[];
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  difficulty: string | null;
  goalType: string | null;
  targetEventType: string | null;
  targetDistance: string | null;
  price: { amountCents: number; currency: string } | null;
  /** null when the product has no PUBLIC/READY media yet (spec §5.1 requires a cover, but drafts mid-setup may lack one). */
  coverImage: { storageKey: string; altText: string } | null;
  /** null = no APPROVED reviews yet ("Novo"), never a literal 0 (RF-112/RNF-012). */
  ratingAverage: number | null;
  reviewCount: number;
  author: { kind: "coach" | "school"; id: string; name: string } | null;
  /**
   * TM031 — always `false`: `TrainingProduct` has no field today that records
   * "coaching/follow-up is included in this purchase" (that is a
   * per-license concept via `LicenseCoachEngagement`, created post-purchase,
   * never a product-level flag). Returning anything else would be inventing
   * commercial data (RNF-012). Flagged in the session report as a schema gap
   * for product/engineering to close with a dedicated migration.
   */
  coachingIncluded: boolean;
  createdAt: Date;
}

type ProductRow = {
  id: string;
  schoolId: string | null;
  coachId: string | null;
  slug: string | null;
  title: string;
  description: string | null;
  sportType: string | null;
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  difficulty: string | null;
  goalType: string | null;
  targetEventType: string | null;
  targetDistance: string | null;
  priceCents: number | null;
  currency: string | null;
  coverMediaId: string | null;
  createdAt: Date;
};

const SELECT_FIELDS = {
  id: true, schoolId: true, coachId: true, slug: true, title: true, description: true,
  sportType: true, durationWeeks: true, sessionsPerWeek: true, difficulty: true,
  goalType: true, targetEventType: true, targetDistance: true, priceCents: true,
  currency: true, coverMediaId: true, createdAt: true,
} as const;

type CursorPayload =
  | { mode: "keyset"; sort: MarketplaceSort; id: string }
  | { mode: "offset"; sort: MarketplaceSort; offset: number };

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string | undefined, expectedSort: MarketplaceSort): CursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (decoded.sort !== expectedSort) return null; // cursor from a different sort mode — restart at page 1 rather than corrupt ordering
    return decoded;
  } catch {
    return null;
  }
}

/**
 * RNF-012 — "mais bem avaliados" must not let a single 5★ review outrank
 * dozens of 4.9★ reviews. Simple, transparent, deterministic prior
 * (documented, not a magic number pulled from nowhere): a product's score is
 * pulled toward a neutral 3.5 until it accumulates enough reviews to stand on
 * its own. `MIN_RATING_VOLUME_WEIGHT` is that "enough" in review-count units.
 * TM049 (later task) owns the final, product-approved formula — this is a
 * defensible placeholder that already satisfies the "not simulated" bar.
 */
const MIN_RATING_VOLUME_WEIGHT = 10;
const GLOBAL_PRIOR_RATING = 3.5;

/** Safety cap for the two sorts that require in-memory ranking (see `executeAggregateSort`). */
const MAX_AGGREGATE_SORT_CANDIDATES = 500;

type RatingStats = { avg: number; count: number };

function weightedRating(stats: RatingStats | undefined): number {
  if (!stats || stats.count === 0) return -Infinity; // no reviews sorts last under "best-rated"
  return (stats.avg * stats.count + GLOBAL_PRIOR_RATING * MIN_RATING_VOLUME_WEIGHT) / (stats.count + MIN_RATING_VOLUME_WEIGHT);
}

export class ListMarketplaceProducts {
  constructor(
    private readonly db: Pick<
      PrismaClient,
      "trainingProduct" | "marketplaceReview" | "trainingPurchase" | "coachProfile" | "school" | "marketplaceMedia"
    >,
  ) {}

  async execute(raw: unknown): Promise<{ items: MarketplaceProductSummary[]; nextCursor: string | null; totalCount: number }> {
    const input = listMarketplaceProductsSchema.parse(raw);
    const sort: MarketplaceSort = input.sort ?? (input.q ? MarketplaceSort.RELEVANCE : MarketplaceSort.RECENT);

    // Non-negotiable (RF-001, copied verbatim for this superset): never let
    // any parameter elevate the result beyond PUBLISHED+PUBLIC.
    const where: Record<string, unknown> = {
      status: TrainingProductStatus.PUBLISHED,
      visibility: TrainingProductVisibility.PUBLIC,
    };
    if (input.schoolId) where.schoolId = input.schoolId;
    if (input.coachId) where.coachId = input.coachId;
    if (input.sportType?.length) where.sportType = { in: input.sportType };
    if (input.difficulty) where.difficulty = input.difficulty;
    if (input.goal) where.goalType = input.goal;
    if (input.eventType) where.targetEventType = input.eventType;
    if (input.eventDistance) where.targetDistance = input.eventDistance;
    if (input.sessionsPerWeek) where.sessionsPerWeek = input.sessionsPerWeek;
    if (input.language) where.language = input.language;
    if (input.equipment) where.equipment = { contains: input.equipment, mode: "insensitive" };
    if (input.q) where.title = { contains: input.q, mode: "insensitive" };
    if (input.weeksMin !== undefined || input.weeksMax !== undefined) {
      where.durationWeeks = {
        ...(input.weeksMin !== undefined ? { gte: input.weeksMin } : {}),
        ...(input.weeksMax !== undefined ? { lte: input.weeksMax } : {}),
      };
    }
    if (input.free === true) {
      where.priceCents = null;
    } else if (input.free === false) {
      where.priceCents = { not: null };
    }
    if (input.priceMin !== undefined || input.priceMax !== undefined) {
      where.priceCents = {
        ...(typeof where.priceCents === "object" && where.priceCents !== null ? (where.priceCents as object) : {}),
        ...(input.priceMin !== undefined ? { gte: input.priceMin } : {}),
        ...(input.priceMax !== undefined ? { lte: input.priceMax } : {}),
      };
    }

    if (sort === MarketplaceSort.MOST_PURCHASED || sort === MarketplaceSort.BEST_RATED) {
      return this.executeAggregateSort(where, input, sort);
    }

    if (input.minRating !== undefined) {
      const qualifyingIds = await this.qualifyingIdsForMinRating(input.minRating);
      where.id = { in: qualifyingIds };
    }

    const cursorPayload = decodeCursor(input.cursor, sort);
    const cursorFilter = cursorPayload && cursorPayload.mode === "keyset" ? { id: cursorPayload.id } : undefined;

    // RF-105 — "contagem e paginação DEVEM ocorrer no servidor": a real
    // count of every matching row (not just how many fit on this page), run
    // against the exact same `where` used for the page itself.
    const [rows, totalCount] = await Promise.all([
      this.db.trainingProduct.findMany({
        where,
        orderBy: this.orderByFor(sort),
        take: input.limit + 1,
        skip: cursorFilter ? 1 : 0,
        cursor: cursorFilter,
        select: SELECT_FIELDS,
      }) as Promise<ProductRow[]>,
      this.db.trainingProduct.count({ where }),
    ]);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor({ mode: "keyset", sort, id: lastItem.id }) : null;

    return { items: await this.toSummaries(items), nextCursor, totalCount };
  }

  private orderByFor(sort: MarketplaceSort) {
    switch (sort) {
      case MarketplaceSort.PRICE_ASC:
        return [{ priceCents: "asc" as const }, { id: "asc" as const }];
      case MarketplaceSort.PRICE_DESC:
        return [{ priceCents: "desc" as const }, { id: "asc" as const }];
      case MarketplaceSort.RELEVANCE:
        // No Postgres full-text search configured in this project yet — the
        // closest honest proxy without raw SQL is alphabetical title order
        // (same convention as SearchSchools). Revisit if/when full-text
        // ranking is introduced.
        return [{ title: "asc" as const }, { id: "asc" as const }];
      case MarketplaceSort.RECENT:
      default:
        return [{ createdAt: "desc" as const }, { id: "asc" as const }];
    }
  }

  /**
   * "mais comprados" and "mais bem avaliados" both need an aggregate over a
   * related table that Prisma cannot express as a native, filtered
   * `orderBy` on the parent model (relation `_count` ordering exists but
   * cannot be filtered by `status`/`moderationStatus`, and relation `_avg`
   * ordering does not exist at all). Ranking is computed in application code
   * over a bounded candidate set instead of native DB pagination — honest,
   * real-data-based (RNF-012), but not free of an upper bound: see
   * `MAX_AGGREGATE_SORT_CANDIDATES`.
   */
  private async executeAggregateSort(
    where: Record<string, unknown>,
    input: ListMarketplaceProductsInput,
    sort: typeof MarketplaceSort.MOST_PURCHASED | typeof MarketplaceSort.BEST_RATED,
  ): Promise<{ items: MarketplaceProductSummary[]; nextCursor: string | null; totalCount: number }> {
    let candidates = (await this.db.trainingProduct.findMany({
      where,
      orderBy: [{ createdAt: "desc" as const }, { id: "asc" as const }],
      take: MAX_AGGREGATE_SORT_CANDIDATES,
      select: SELECT_FIELDS,
    })) as ProductRow[];

    let ratingStats: Map<string, RatingStats> | null = null;
    if (sort === MarketplaceSort.BEST_RATED || input.minRating !== undefined) {
      ratingStats = await this.ratingStats(candidates.map((c) => c.id));
    }
    if (input.minRating !== undefined) {
      candidates = candidates.filter((c) => (ratingStats!.get(c.id)?.avg ?? 0) >= input.minRating!);
    }

    let ranked: ProductRow[];
    if (sort === MarketplaceSort.MOST_PURCHASED) {
      const counts = await this.purchaseCounts(candidates.map((c) => c.id));
      ranked = [...candidates].sort(
        (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id.localeCompare(b.id),
      );
    } else {
      ranked = [...candidates].sort(
        (a, b) => weightedRating(ratingStats!.get(b.id)) - weightedRating(ratingStats!.get(a.id)) || a.id.localeCompare(b.id),
      );
    }

    const cursorPayload = decodeCursor(input.cursor, sort);
    const offset = cursorPayload && cursorPayload.mode === "offset" ? cursorPayload.offset : 0;
    const page = ranked.slice(offset, offset + input.limit);
    const hasMore = offset + input.limit < ranked.length;
    const nextCursor = hasMore ? encodeCursor({ mode: "offset", sort, offset: offset + input.limit }) : null;

    // `ranked.length` (not a DB count) — bounded by MAX_AGGREGATE_SORT_CANDIDATES,
    // same documented cap as the ranking itself; still a real count of what
    // was actually ranked, never an invented number (RNF-012).
    return { items: await this.toSummaries(page), nextCursor, totalCount: ranked.length };
  }

  private async qualifyingIdsForMinRating(minRating: number): Promise<string[]> {
    const groups = await this.db.marketplaceReview.groupBy({
      by: ["productId"],
      where: { moderationStatus: "APPROVED" },
      _avg: { stars: true },
    });
    return groups.filter((g) => (g._avg.stars ?? 0) >= minRating).map((g) => g.productId);
  }

  private async ratingStats(productIds: string[]): Promise<Map<string, RatingStats>> {
    if (productIds.length === 0) return new Map();
    const groups = await this.db.marketplaceReview.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, moderationStatus: "APPROVED" },
      _avg: { stars: true },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.productId, { avg: g._avg.stars ?? 0, count: g._count._all }]));
  }

  private async purchaseCounts(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const groups = await this.db.trainingPurchase.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, status: "COMPLETED" },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.productId, g._count._all]));
  }

  /**
   * One cover image per product for the card grid (spec §5.1 — a cover is
   * required at publish time, but a mid-setup draft, unreachable here since
   * this listing already forces PUBLISHED, should never crash rendering if
   * one is somehow still missing — `coverImage: null` and the FE renders a
   * placeholder). Prefers the product's explicit `coverMediaId`; falls back
   * to the first PUBLIC/READY media by `sortOrder` otherwise. Never
   * considers PREVIEW/PRIVATE media — those are gated to the detail page's
   * "amostra" context, not the public grid.
   */
  private async coverImages(rows: ProductRow[]): Promise<Map<string, { storageKey: string; altText: string }>> {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return new Map();
    const media = await this.db.marketplaceMedia.findMany({
      where: { productId: { in: ids }, access: "PUBLIC", processingStatus: "READY" },
      orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, productId: true, storageKey: true, altText: true },
    });
    const byProduct = new Map<string, typeof media>();
    for (const m of media) {
      const list = byProduct.get(m.productId) ?? [];
      list.push(m);
      byProduct.set(m.productId, list);
    }

    const result = new Map<string, { storageKey: string; altText: string }>();
    for (const row of rows) {
      const candidates = byProduct.get(row.id);
      if (!candidates?.length) continue;
      const chosen = (row.coverMediaId && candidates.find((c) => c.id === row.coverMediaId)) || candidates[0];
      if (chosen) result.set(row.id, { storageKey: chosen.storageKey, altText: chosen.altText });
    }
    return result;
  }

  private async toSummaries(rows: ProductRow[]): Promise<MarketplaceProductSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const coachIds = [...new Set(rows.filter((r) => r.coachId).map((r) => r.coachId as string))];
    const schoolIds = [...new Set(rows.filter((r) => r.schoolId).map((r) => r.schoolId as string))];

    const [ratingMap, coaches, schools, mediaByProduct] = await Promise.all([
      this.ratingStats(ids),
      coachIds.length
        ? this.db.coachProfile.findMany({ where: { id: { in: coachIds } }, select: { id: true, displayName: true } })
        : Promise.resolve([] as { id: string; displayName: string }[]),
      schoolIds.length
        ? this.db.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
      this.coverImages(rows),
    ]);
    const coachById = new Map(coaches.map((c) => [c.id, c]));
    const schoolById = new Map(schools.map((s) => [s.id, s]));

    return rows.map((r) => {
      const stats = ratingMap.get(r.id);
      const author = r.coachId
        ? coachById.has(r.coachId)
          ? { kind: "coach" as const, id: r.coachId, name: coachById.get(r.coachId)!.displayName }
          : null
        : r.schoolId
          ? schoolById.has(r.schoolId)
            ? { kind: "school" as const, id: r.schoolId, name: schoolById.get(r.schoolId)!.name }
            : null
          : null;

      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        sportTypes: r.sportType ? [r.sportType] : [],
        durationWeeks: r.durationWeeks,
        sessionsPerWeek: r.sessionsPerWeek,
        difficulty: r.difficulty,
        goalType: r.goalType,
        targetEventType: r.targetEventType,
        targetDistance: r.targetDistance,
        price: r.priceCents !== null && r.currency !== null ? { amountCents: r.priceCents, currency: r.currency } : null,
        coverImage: mediaByProduct.get(r.id) ?? null,
        ratingAverage: stats && stats.count > 0 ? Number(stats.avg.toFixed(2)) : null,
        reviewCount: stats?.count ?? 0,
        author,
        coachingIncluded: false,
        createdAt: r.createdAt,
      };
    });
  }
}
