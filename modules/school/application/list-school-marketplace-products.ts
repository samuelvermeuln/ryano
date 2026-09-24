import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TrainingPurchaseStatus } from "../domain/enums";
import { CanManageSchool } from "./can-manage-school";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";

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
    const [purchasesByProduct, licensesByProduct] = await Promise.all([
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
    ]);

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
      })),
      nextCursor,
    };
  }
}
