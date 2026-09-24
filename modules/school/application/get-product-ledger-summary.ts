import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { trainingProductSchema } from "../domain/training-product";
import { SellerLedgerEntryType } from "../domain/enums";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const getProductLedgerSummarySchema = z.strictObject({ productId: id });
export type GetProductLedgerSummaryInput = z.infer<typeof getProductLedgerSummarySchema>;

/** RF-205 — aggregate-only, read directly from SellerLedgerEntry. */
export interface ProductLedgerSummary {
  productId: string;
  currency: string | null;
  /** Sum of grossAmount across every ledger entry (SALE positive, REFUND its exact negative mirror — TM067) — the CURRENT net position, never a parallel recomputation from TrainingPurchase.pricePaid. */
  grossCents: number;
  feeCents: number;
  netCents: number;
  saleEntries: number;
  refundEntries: number;
}

/**
 * TM068 (RF-205) — the financial-panel counterpart to `GetProductSalesSummary`
 * (TM023, purchase counts/status). Deliberately a SEPARATE use case/DTO: that
 * one sums `TrainingPurchase.pricePaid` (a status count, not a financial
 * ledger); this one sums `SellerLedgerEntry` rows (TM067) so the numbers
 * this task shows can never drift from what the ledger actually records —
 * the criterio this task exists to satisfy ("valores exibidos batem com o
 * ledger, não com um cálculo paralelo na UI").
 */
export class GetProductLedgerSummary {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<ProductLedgerSummary> {
    const { productId } = getProductLedgerSummarySchema.parse(raw);

    const storedProduct = await this.db.trainingProduct.findUnique({ where: { id: productId } });
    if (!storedProduct) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
    const product = trainingProductSchema.parse(storedProduct);

    const guard = new CanManageTrainingProduct(this.db, new SchoolMembershipRepository(this.db));
    const { coachId } = await guard.assertAuthorCoach(actorUserId, product.schoolId);
    if (product.coachId && product.coachId !== coachId) {
      throw new SchoolError("FORBIDDEN", "Você não pode ver o financeiro deste produto.", 403);
    }

    const byType = await this.db.sellerLedgerEntry.groupBy({
      by: ["type"],
      where: { purchase: { productId } },
      _count: { _all: true },
      _sum: { grossAmount: true, feeAmount: true, netAmount: true },
    });

    const countByType = (type: string) => byType.find((row) => row.type === type)?._count._all ?? 0;
    const sum = (field: "grossAmount" | "feeAmount" | "netAmount") =>
      byType.reduce((total, row) => total + (row._sum[field] ?? 0), 0);

    return {
      productId: product.id,
      currency: product.currency,
      grossCents: sum("grossAmount"),
      feeCents: sum("feeAmount"),
      netCents: sum("netAmount"),
      saleEntries: countByType(SellerLedgerEntryType.SALE),
      refundEntries: countByType(SellerLedgerEntryType.REFUND),
    };
  }
}
