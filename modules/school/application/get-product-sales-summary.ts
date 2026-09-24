import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { trainingProductSchema } from "../domain/training-product";
import { TrainingLicenseStatus, TrainingPurchaseStatus } from "../domain/enums";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const getProductSalesSummarySchema = z.strictObject({ productId: id });
export type GetProductSalesSummaryInput = z.infer<typeof getProductSalesSummarySchema>;

/** RF-104 — aggregate-only sales DTO. No field here may ever carry a per-athlete value. */
export interface ProductSalesSummary {
  productId: string;
  currency: string | null;
  totalPurchases: number;
  completedPurchases: number;
  pendingPurchases: number;
  refundedPurchases: number;
  cancelledPurchases: number;
  /** Sum of `pricePaid` for COMPLETED purchases only (minor currency units). */
  grossRevenueCents: number;
  activeLicenses: number;
}

/**
 * TM023 — Aggregated sales/status view of the author's own product (RF-104).
 *
 * Deliberately returns ONLY counts and a revenue sum — never a purchase
 * list, an `athleteId`, execution data, biometrics, or buyer contact info.
 * Selling a product does not create a relationship with the buyer
 * (RNF-002); this DTO's shape is the enforcement of that boundary, not just
 * its values (see the "form, not just value" test in
 * tests/get-product-sales-summary.test.ts).
 */
export class GetProductSalesSummary {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<ProductSalesSummary> {
    const { productId } = getProductSalesSummarySchema.parse(raw);

    const storedProduct = await this.db.trainingProduct.findUnique({ where: { id: productId } });
    if (!storedProduct) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
    const product = trainingProductSchema.parse(storedProduct);

    const guard = new CanManageTrainingProduct(this.db, new SchoolMembershipRepository(this.db));
    const { coachId } = await guard.assertAuthorCoach(actorUserId, product.schoolId);
    if (product.coachId && product.coachId !== coachId) {
      throw new SchoolError("FORBIDDEN", "Você não pode ver as vendas deste produto.", 403);
    }

    const [byStatus, activeLicenses] = await Promise.all([
      this.db.trainingPurchase.groupBy({
        by: ["status"], where: { productId }, _count: { _all: true }, _sum: { pricePaid: true },
      }),
      this.db.trainingLicense.count({ where: { productId, status: TrainingLicenseStatus.ACTIVE } }),
    ]);

    const countByStatus = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const grossRevenueCents = byStatus.find((row) => row.status === TrainingPurchaseStatus.COMPLETED)?._sum.pricePaid ?? 0;
    const totalPurchases = byStatus.reduce((sum, row) => sum + row._count._all, 0);

    return {
      productId: product.id,
      currency: product.currency,
      totalPurchases,
      completedPurchases: countByStatus(TrainingPurchaseStatus.COMPLETED),
      pendingPurchases: countByStatus(TrainingPurchaseStatus.PENDING),
      refundedPurchases: countByStatus(TrainingPurchaseStatus.REFUNDED),
      cancelledPurchases: countByStatus(TrainingPurchaseStatus.CANCELLED),
      grossRevenueCents,
      activeLicenses,
    };
  }
}
