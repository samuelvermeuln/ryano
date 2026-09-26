/**
 * School-wide marketplace KPIs and payout status for
 * `/escola/[schoolId]/marketplace`.
 *
 * Separate from `ListSchoolMarketplaceProducts` (which is per-product and
 * paginated) because these totals must cover EVERY product the school owns,
 * not just the page currently on screen — a header that silently summed one
 * page would misreport revenue the moment a school had 21 products.
 *
 * Money comes exclusively from `SellerLedgerEntry` (TM067), never from
 * summing `TrainingPurchase.pricePaid`, so the figures here can never drift
 * from what the ledger records. The platform fee shown is the CURRENT
 * configured rate, presented as such — historical entries keep whatever rate
 * was persisted on them at sale time.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SellerType, TrainingProductStatus, TrainingPurchaseStatus } from "../domain/enums";
import { getMarketplacePlatformFeeBps } from "../config/marketplace-fee-settings";
import { CanManageSchool } from "./can-manage-school";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const getSchoolMarketplaceOverviewSchema = z.strictObject({ schoolId: id });

export interface SchoolMarketplaceOverview {
  products: { total: number; published: number; draft: number; archived: number };
  sales: { completedPurchases: number; pendingPurchases: number; activeLicenses: number };
  views: { totalViews: number; last30Days: number };
  money: {
    currency: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    /** Current configured platform fee in basis points — a config value, not a historical fact. */
    platformFeeBps: number;
  };
  /**
   * Where the money lands. `null` means no payout account exists yet, which is
   * a real operational state (sales can be recorded before onboarding) and is
   * surfaced as such rather than as a zero.
   */
  payout: { provider: string; kycStatus: string; hasPayoutAccount: boolean } | null;
}

export class GetSchoolMarketplaceOverview {
  private readonly canManageSchool: CanManageSchool;

  constructor(private readonly db: PrismaClient) {
    this.canManageSchool = new CanManageSchool(new SchoolMembershipRepository(db));
  }

  async execute(actorUserId: string | null, raw: unknown): Promise<SchoolMarketplaceOverview> {
    const { schoolId } = getSchoolMarketplaceOverviewSchema.parse(raw);
    await this.canManageSchool.assert(actorUserId, schoolId);

    const products = await this.db.trainingProduct.findMany({
      where: { schoolId },
      select: { id: true, status: true, currency: true },
    });
    const productIds = products.map((p) => p.id);

    const countStatus = (status: string) => products.filter((p) => p.status === status).length;

    if (productIds.length === 0) {
      return {
        products: { total: 0, published: 0, draft: 0, archived: 0 },
        sales: { completedPurchases: 0, pendingPurchases: 0, activeLicenses: 0 },
        views: { totalViews: 0, last30Days: 0 },
        money: { currency: "BRL", grossCents: 0, feeCents: 0, netCents: 0, platformFeeBps: getMarketplacePlatformFeeBps() },
        payout: await this.readPayout(schoolId),
      };
    }

    const [purchases, activeLicenses, viewRows, ledger, payout] = await Promise.all([
      this.db.trainingPurchase.groupBy({
        by: ["status"], where: { productId: { in: productIds } }, _count: { _all: true },
      }),
      this.db.trainingLicense.count({ where: { productId: { in: productIds }, status: "ACTIVE" } }),
      this.db.trainingProductViewDaily.findMany({
        where: { productId: { in: productIds } },
        select: { day: true, views: true },
      }),
      this.db.sellerLedgerEntry.aggregate({
        where: { purchase: { productId: { in: productIds } } },
        _sum: { grossAmount: true, feeAmount: true, netAmount: true },
      }),
      this.readPayout(schoolId),
    ]);

    const sinceDay = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const totalViews = viewRows.reduce((sum, row) => sum + row.views, 0);
    const last30Days = viewRows.reduce((sum, row) => (row.day >= sinceDay ? sum + row.views : sum), 0);

    const purchaseCount = (status: string) => purchases.find((p) => p.status === status)?._count._all ?? 0;

    return {
      products: {
        total: products.length,
        published: countStatus(TrainingProductStatus.PUBLISHED),
        draft: countStatus(TrainingProductStatus.DRAFT),
        archived: countStatus(TrainingProductStatus.ARCHIVED),
      },
      sales: {
        completedPurchases: purchaseCount(TrainingPurchaseStatus.COMPLETED),
        pendingPurchases: purchaseCount(TrainingPurchaseStatus.PENDING),
        activeLicenses,
      },
      views: { totalViews, last30Days },
      money: {
        // Products are single-currency in practice; the first configured one
        // labels the totals rather than inventing a conversion we cannot do.
        currency: products.find((p) => p.currency)?.currency ?? "BRL",
        grossCents: ledger._sum.grossAmount ?? 0,
        feeCents: ledger._sum.feeAmount ?? 0,
        netCents: ledger._sum.netAmount ?? 0,
        platformFeeBps: getMarketplacePlatformFeeBps(),
      },
      payout,
    };
  }

  private async readPayout(schoolId: string): Promise<SchoolMarketplaceOverview["payout"]> {
    const account = await this.db.sellerAccount.findFirst({
      where: { sellerType: SellerType.SCHOOL, sellerId: schoolId },
      // payoutAccountRef is an opaque provider reference, never a bank/card
      // number, and is reduced to a boolean before leaving this use case.
      select: { provider: true, kycStatus: true, payoutAccountRef: true },
    });
    if (!account) return null;
    return {
      provider: account.provider,
      kycStatus: account.kycStatus,
      hasPayoutAccount: account.payoutAccountRef !== null,
    };
  }
}
