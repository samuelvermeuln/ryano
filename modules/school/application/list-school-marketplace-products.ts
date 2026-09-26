import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TrainingPurchaseStatus } from "../domain/enums";
import { CanManageSchool } from "./can-manage-school";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { GetProductViewSummaries } from "./record-product-view";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const listSchoolMarketplaceProductsSchema = z.strictObject({
  schoolId: id,
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
export type ListSchoolMarketplaceProductsInput = z.infer<typeof listSchoolMarketplaceProductsSchema>;

/** RF-104 — aggregate-only, same discipline as GetProductSalesSummary (TM023): never a buyer/athleteId. */
export interface SchoolMarketplaceProductSummary {
  id: string;
  title: string;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
  sportType: string | null;
  author: { coachId: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  sales: {
    totalPurchases: number;
    completedPurchases: number;
    pendingPurchases: number;
    grossRevenueCents: number;
    activeLicenses: number;
  };
  /** Aggregate-only page views — never attributable to a person (no userId is stored at all). */
  views: { totalViews: number; last30Days: number };
  /** Size of the PRIVATE allow-list; 0 for every other visibility. */
  audienceCount: number;
  /** Net position from the seller ledger, the only source of truth for money owed. */
  ledger: { grossCents: number; feeCents: number; netCents: number } | null;
}

/**
 * TM046 (RF-105/RNF-001) — `/escola/[schoolId]/marketplace`'s use case:
 * every product commercially owned by this school (`schoolId` on
 * `TrainingProduct`), any status, with an aggregate sales summary per
 * product — never a purchase row or an `athleteId`, so a buyer from outside
 * the school (or any buyer at all) can never "appear listed here" because no
 * buyer is ever listed, only counts (same RF-104 boundary
 * `GetProductSalesSummary`, TM023, already enforces for a single product).
 *
 * OWNER/ADMIN only — reuses `CanManageSchool`, the same bar every other
 * school-management surface in this module already uses (no second
 * authorization concept, per design.md §4).
 */
export class ListSchoolMarketplaceProducts {
  private readonly canManageSchool: CanManageSchool;

  constructor(private readonly db: PrismaClient) {
    this.canManageSchool = new CanManageSchool(new SchoolMembershipRepository(db));
  }

  async execute(actorUserId: string | null, raw: unknown): Promise<{ items: SchoolMarketplaceProductSummary[]; nextCursor: string | null }> {
    const input = listSchoolMarketplaceProductsSchema.parse(raw);
    await this.canManageSchool.assert(actorUserId, input.schoolId);

    let cursorFilter: { id: string } | undefined;
    if (input.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as { id: string };
        cursorFilter = { id: decoded.id };
      } catch {
        cursorFilter = undefined;
      }
    }

    const rows = await this.db.trainingProduct.findMany({
      // schoolId always from the validated input, never trusted straight
      // from an unauthenticated source — CanManageSchool.assert above is
      // what makes filtering by it here safe.
      where: { schoolId: input.schoolId },
      take: input.limit + 1,
      skip: cursorFilter ? 1 : 0,
      cursor: cursorFilter,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true, title: true, status: true, visibility: true, priceCents: true, currency: true, sportType: true,
        createdAt: true, updatedAt: true,
        coach: { select: { id: true, displayName: true } },
      },
    });

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? Buffer.from(JSON.stringify({ id: lastItem.id })).toString("base64url")
      : null;

    const productIds = items.map((row) => row.id);
    const [purchasesByProduct, licensesByProduct, audienceByProduct, ledgerByProduct, viewSummaries] = await Promise.all([
      productIds.length > 0
        ? this.db.trainingPurchase.groupBy({
            by: ["productId", "status"], where: { productId: { in: productIds } }, _count: { _all: true }, _sum: { pricePaid: true },
          })
        : Promise.resolve([]),
      productIds.length > 0
        ? this.db.trainingLicense.groupBy({
            by: ["productId"], where: { productId: { in: productIds }, status: "ACTIVE" }, _count: { _all: true },
          })
        : Promise.resolve([]),
      productIds.length > 0
        ? this.db.trainingProductAudience.groupBy({
            by: ["productId"], where: { productId: { in: productIds }, revokedAt: null }, _count: { _all: true },
          })
        : Promise.resolve([]),
      // Money comes from the ledger, never from summing TrainingPurchase.pricePaid:
      // the same discipline GetProductLedgerSummary (TM068) exists to enforce.
      productIds.length > 0
        ? this.db.sellerLedgerEntry.groupBy({
            by: ["purchaseId"],
            where: { purchase: { productId: { in: productIds } } },
            _sum: { grossAmount: true, feeAmount: true, netAmount: true },
          })
        : Promise.resolve([]),
      new GetProductViewSummaries(this.db).execute(productIds),
    ]);

    // groupBy cannot group ledger entries by the product behind the purchase,
    // so the purchase->product mapping is resolved once here rather than with
    // one query per product.
    const purchaseToProduct = new Map<string, string>();
    if (ledgerByProduct.length > 0) {
      const purchases = await this.db.trainingPurchase.findMany({
        where: { id: { in: ledgerByProduct.map((row) => row.purchaseId) } },
        select: { id: true, productId: true },
      });
      for (const purchase of purchases) purchaseToProduct.set(purchase.id, purchase.productId);
    }
    const ledgerTotals = new Map<string, { grossCents: number; feeCents: number; netCents: number }>();
    for (const row of ledgerByProduct) {
      const productId = purchaseToProduct.get(row.purchaseId);
      if (!productId) continue;
      const current = ledgerTotals.get(productId) ?? { grossCents: 0, feeCents: 0, netCents: 0 };
      current.grossCents += row._sum.grossAmount ?? 0;
      current.feeCents += row._sum.feeAmount ?? 0;
      current.netCents += row._sum.netAmount ?? 0;
      ledgerTotals.set(productId, current);
    }

    const salesByProduct = new Map<string, SchoolMarketplaceProductSummary["sales"]>();
    for (const productId of productIds) {
      const rowsForProduct = purchasesByProduct.filter((r) => r.productId === productId);
      salesByProduct.set(productId, {
        totalPurchases: rowsForProduct.reduce((sum, r) => sum + r._count._all, 0),
        completedPurchases: rowsForProduct.find((r) => r.status === TrainingPurchaseStatus.COMPLETED)?._count._all ?? 0,
        pendingPurchases: rowsForProduct.find((r) => r.status === TrainingPurchaseStatus.PENDING)?._count._all ?? 0,
        grossRevenueCents: rowsForProduct.find((r) => r.status === TrainingPurchaseStatus.COMPLETED)?._sum.pricePaid ?? 0,
        activeLicenses: licensesByProduct.find((r) => r.productId === productId)?._count._all ?? 0,
      });
    }

    return {
      items: items.map((row) => ({
        id: row.id, title: row.title, status: row.status, visibility: row.visibility,
        priceCents: row.priceCents, currency: row.currency, sportType: row.sportType,
        author: row.coach ? { coachId: row.coach.id, name: row.coach.displayName } : null,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
        sales: salesByProduct.get(row.id) ?? { totalPurchases: 0, completedPurchases: 0, pendingPurchases: 0, grossRevenueCents: 0, activeLicenses: 0 },
        views: {
          totalViews: viewSummaries.get(row.id)?.totalViews ?? 0,
          last30Days: viewSummaries.get(row.id)?.last30Days ?? 0,
        },
        audienceCount: audienceByProduct.find((r) => r.productId === row.id)?._count._all ?? 0,
        ledger: ledgerTotals.get(row.id) ?? null,
      })),
      nextCursor,
    };
  }
}
