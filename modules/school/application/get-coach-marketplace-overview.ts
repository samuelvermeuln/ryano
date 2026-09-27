/**
 * Seller KPIs for a coach's own marketplace catalogue — the totals behind
 * `/professor/[schoolId]/marketplace`.
 *
 * Scoped to products the coach owns *personally* (`TrainingProduct.coachId`),
 * deliberately excluding products owned by a school the coach merely
 * administers. Those already have their own school-wide panel
 * (`GetSchoolMarketplaceOverview`), and folding them in here would report a
 * school's revenue as the coach's own earnings — two different pockets, and the
 * seller ledger keeps them on two different `SellerAccount` rows.
 *
 * Money comes exclusively from `SellerLedgerEntry` (TM067), never from summing
 * `TrainingPurchase.pricePaid`, so these figures cannot drift from the ledger.
 * Counts of purchases and licenses, by contrast, legitimately come from the
 * purchase/license tables — they are not money.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SellerLedgerEntryType, SellerType, TrainingProductStatus, TrainingPurchaseStatus } from "../domain/enums";
import { getMarketplacePlatformFeeBps } from "../config/marketplace-fee-settings";
import { SchoolError } from "../domain/errors";
import { GetProductViewSummaries } from "./record-product-view";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const getCoachMarketplaceOverviewSchema = z.strictObject({ actorUserId: id });

/** One row of the seller's catalogue, already joined to its own numbers. */
export interface CoachProductRow {
  id: string;
  title: string;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
  updatedAt: Date;
  completedPurchases: number;
  refundedPurchases: number;
  activeLicenses: number;
  totalViews: number;
  views30d: number;
  /**
   * Completed purchases per 100 views, or `null` when the product has no views
   * yet. Null is not zero: "nobody bought out of nobody looking" is unknown
   * performance, while 0% means real traffic that never converted, and a
   * seller deciding whether to change the price needs to tell those apart.
   */
  conversionPct: number | null;
  netCents: number;
}

export interface CoachMarketplaceOverview {
  products: { total: number; published: number; draft: number; archived: number };
  sales: { completedPurchases: number; refundedPurchases: number; activeLicenses: number };
  views: { totalViews: number; last30Days: number };
  money: {
    currency: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    /** Current configured rate, a config value — historical entries keep the rate persisted at sale time. */
    platformFeeBps: number;
  };
  /** `null` when no payout account exists yet: a real operational state, not a zero. */
  payout: { provider: string; kycStatus: string; hasPayoutAccount: boolean } | null;
  rows: CoachProductRow[];
}

export class GetCoachMarketplaceOverview {
  constructor(private readonly db: PrismaClient) {}

  async execute(raw: unknown): Promise<CoachMarketplaceOverview> {
    const input = getCoachMarketplaceOverviewSchema.parse(raw);

    const coach = await this.db.coachProfile.findUnique({
      where: { userId: input.actorUserId },
      select: { id: true, status: true },
    });
    if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
    if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "Seu perfil de professor está inativo.", 403);

    const products = await this.db.trainingProduct.findMany({
      where: { coachId: coach.id },
      select: {
        id: true, title: true, status: true, visibility: true,
        priceCents: true, currency: true, updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    const productIds = products.map((product) => product.id);

    // A coach with no products still gets a well-formed answer: the panel
    // should render its empty state, not crash on a missing aggregate.
    const [purchaseRows, licenseRows, viewSummaries, sellerAccount] = await Promise.all([
      productIds.length === 0 ? [] : this.db.trainingPurchase.groupBy({
        by: ["productId", "status"],
        where: { productId: { in: productIds } },
        _count: { _all: true },
      }),
      productIds.length === 0 ? [] : this.db.trainingLicense.groupBy({
        by: ["productId"],
        where: { productId: { in: productIds }, status: "ACTIVE" },
        _count: { _all: true },
      }),
      new GetProductViewSummaries(this.db).execute(productIds),
      this.db.sellerAccount.findFirst({
        where: { sellerType: SellerType.COACH, sellerId: coach.id },
        select: { provider: true, kycStatus: true, payoutAccountRef: true },
      }),
    ]);

    // Per-product money needs the purchase→product link, since ledger entries
    // reference a purchase rather than a product.
    const ledgerEntries = productIds.length === 0 ? [] : await this.db.sellerLedgerEntry.findMany({
      where: { purchase: { productId: { in: productIds } } },
      select: {
        grossAmount: true, feeAmount: true, netAmount: true, currency: true,
        type: true, purchase: { select: { productId: true } },
      },
    });

    const countOf = (productId: string, status: TrainingPurchaseStatus) =>
      purchaseRows.find((row) => row.productId === productId && row.status === status)?._count._all ?? 0;

    let grossCents = 0;
    let feeCents = 0;
    let netCents = 0;
    const netByProduct = new Map<string, number>();
    // REFUND entries are stored as the exact negative mirror of their SALE
    // (TM067), so a plain sum already yields the current net position — no
    // subtraction branch, which is what keeps this from drifting.
    let ledgerCurrency: string | null = null;
    for (const entry of ledgerEntries) {
      if (entry.type === SellerLedgerEntryType.PAYOUT) continue;
      grossCents += entry.grossAmount;
      feeCents += entry.feeAmount;
      netCents += entry.netAmount;
      ledgerCurrency ??= entry.currency;
      const productId = entry.purchase.productId;
      netByProduct.set(productId, (netByProduct.get(productId) ?? 0) + entry.netAmount);
    }

    const rows: CoachProductRow[] = products.map((product) => {
      const views = viewSummaries.get(product.id) ?? { totalViews: 0, anonViews: 0, last30Days: 0 };
      const completedPurchases = countOf(product.id, TrainingPurchaseStatus.COMPLETED);
      return {
        ...product,
        completedPurchases,
        refundedPurchases: countOf(product.id, TrainingPurchaseStatus.REFUNDED),
        activeLicenses: licenseRows.find((row) => row.productId === product.id)?._count._all ?? 0,
        totalViews: views.totalViews,
        views30d: views.last30Days,
        conversionPct: views.totalViews === 0 ? null : (completedPurchases / views.totalViews) * 100,
        netCents: netByProduct.get(product.id) ?? 0,
      };
    });

    const countStatus = (status: TrainingProductStatus) =>
      products.filter((product) => product.status === status).length;

    const sum = (pick: (row: CoachProductRow) => number) => rows.reduce((total, row) => total + pick(row), 0);

    return {
      products: {
        total: products.length,
        published: countStatus(TrainingProductStatus.PUBLISHED),
        draft: countStatus(TrainingProductStatus.DRAFT),
        archived: countStatus(TrainingProductStatus.ARCHIVED),
      },
      sales: {
        completedPurchases: sum((row) => row.completedPurchases),
        refundedPurchases: sum((row) => row.refundedPurchases),
        activeLicenses: sum((row) => row.activeLicenses),
      },
      views: {
        totalViews: sum((row) => row.totalViews),
        last30Days: sum((row) => row.views30d),
      },
      money: {
        // Falls back to the products' own currency, then BRL, so an empty
        // ledger still formats money instead of rendering "undefined".
        currency: ledgerCurrency ?? products.find((product) => product.currency)?.currency ?? "BRL",
        grossCents,
        feeCents,
        netCents,
        platformFeeBps: getMarketplacePlatformFeeBps(),
      },
      payout: sellerAccount
        ? {
            provider: sellerAccount.provider,
            kycStatus: sellerAccount.kycStatus,
            hasPayoutAccount: sellerAccount.payoutAccountRef !== null,
          }
        : null,
      rows,
    };
  }
}
