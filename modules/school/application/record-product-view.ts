/**
 * "Quantos viram" — increments the daily view bucket for a product's public
 * page.
 *
 * No actor is stored, ever: the counter is aggregate-only by construction
 * (there is no `userId` column to write), which is the same boundary
 * `GetProductSalesSummary` enforces for purchases. The only thing the caller's
 * session affects is which of the two counters moves, so the seller can tell
 * logged-in interest from anonymous reach.
 *
 * Failures are swallowed by callers on purpose: a analytics counter must never
 * be able to break the page it is counting.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const recordProductViewSchema = z.strictObject({
  productId: id,
  anonymous: z.boolean().default(false),
});

/** UTC calendar day, "YYYY-MM-DD" — matches the `day` column's documented meaning. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class RecordProductView {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(raw: unknown): Promise<void> {
    const input = recordProductViewSchema.parse(raw);
    const day = utcDayKey(this.clock());

    // Upsert on the (productId, day) unique key: concurrent views of the same
    // product contend on one row rather than inserting duplicates.
    await this.db.trainingProductViewDaily.upsert({
      where: { productId_day: { productId: input.productId, day } },
      create: {
        productId: input.productId,
        day,
        views: 1,
        anonViews: input.anonymous ? 1 : 0,
      },
      update: {
        views: { increment: 1 },
        ...(input.anonymous ? { anonViews: { increment: 1 } } : {}),
      },
    });
  }
}

export interface ProductViewSummary {
  totalViews: number;
  anonViews: number;
  /** Views in the last 30 UTC days, the window the seller panel shows. */
  last30Days: number;
}

/**
 * Read side of the counter. Kept in the same file as the writer so the two can
 * never drift on what a "view" means, but with no authorization of its own —
 * the callers (seller panels) already assert product ownership before asking.
 */
export class GetProductViewSummaries {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(productIds: string[]): Promise<Map<string, ProductViewSummary>> {
    const summaries = new Map<string, ProductViewSummary>();
    if (productIds.length === 0) return summaries;

    const since = new Date(this.clock().getTime() - 30 * 86_400_000);
    const sinceDay = utcDayKey(since);

    const rows = await this.db.trainingProductViewDaily.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, day: true, views: true, anonViews: true },
    });

    for (const productId of productIds) {
      summaries.set(productId, { totalViews: 0, anonViews: 0, last30Days: 0 });
    }
    for (const row of rows) {
      const current = summaries.get(row.productId);
      if (!current) continue;
      current.totalViews += row.views;
      current.anonViews += row.anonViews;
      // String comparison is safe and index-friendly here because `day` is a
      // zero-padded ISO date, where lexical and chronological order coincide.
      if (row.day >= sinceDay) current.last30Days += row.views;
    }
    return summaries;
  }
}
