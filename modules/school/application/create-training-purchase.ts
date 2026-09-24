import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createTrainingPurchase } from "../domain/training-purchase";
import { createTrainingLicense } from "../domain/training-license";
import { TrainingProductStatus, TrainingPurchaseStatus } from "../domain/enums";

export const createTrainingPurchaseSchema = z.strictObject({
  productId: z.string().min(1),
  /** Required for paid products; omit for free products. */
  paymentRef: z.string().min(1).max(500).optional(),
});
export type CreateTrainingPurchaseInput = z.infer<typeof createTrainingPurchaseSchema>;

export interface CreateTrainingPurchaseRepository {
  trainingProduct: Pick<PrismaClient["trainingProduct"], "findUnique">;
  trainingPurchase: Pick<PrismaClient["trainingPurchase"], "create">;
  trainingLicense: Pick<PrismaClient["trainingLicense"], "create">;
  $transaction: PrismaClient["$transaction"];
}

/**
 * T405 — Records a purchase and immediately creates an ACTIVE license.
 *
 * Payment processing is handled externally (Stripe webhook, PIX callback, etc.).
 * This use-case is called **after** payment confirmation and records the
 * completed purchase + license atomically.
 *
 * For free products (priceCents null) the purchase record is still created
 * (status=COMPLETED immediately) so there is a consistent audit trail.
 */
export class CreateTrainingPurchase {
  constructor(
    private readonly db: CreateTrainingPurchaseRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(athleteId: string, raw: unknown) {
    const input = createTrainingPurchaseSchema.parse(raw);
    const now = this.clock();

    return this.db.$transaction(async (tx) => {
      const product = await tx.trainingProduct.findUnique({
        where: { id: input.productId },
        select: { id: true, status: true, priceCents: true, currency: true, currentVersionId: true },
      });

      if (!product) {
        throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
      }
      if (product.status !== TrainingProductStatus.PUBLISHED) {
        throw new SchoolError("PRODUCT_NOT_AVAILABLE", "Este produto não está disponível para compra.", 409);
      }
      if (!product.currentVersionId) {
        throw new SchoolError("PRODUCT_NO_VERSION", "Produto sem versão publicada.", 409);
      }
      if (product.priceCents !== null && !input.paymentRef) {
        throw new SchoolError("PAYMENT_REF_REQUIRED", "Referência de pagamento obrigatória para produtos pagos.", 422);
      }

      const purchaseId = randomUUID();
      const purchase = createTrainingPurchase(
        {
          id: purchaseId,
          productId: product.id,
          athleteId,
          paymentRef: input.paymentRef ?? null,
          pricePaid: product.priceCents,
          currency: product.currency,
          status: TrainingPurchaseStatus.COMPLETED,
        },
        now,
      );

      const license = createTrainingLicense(
        {
          id: randomUUID(),
          productId: product.id,
          versionId: product.currentVersionId,
          purchaseId: purchase.id,
          athleteId,
          startedAt: now,
          expiresAt: null,
          revokedAt: null,
        },
        now,
      );

      // TM002 — `TrainingLicense.purchaseId` is a FK to `TrainingPurchase.id`:
      // the purchase row must exist (and be awaited/committed within this
      // transaction) before the license row referencing it is created.
      // Firing both via `Promise.all` raced the two writes against that FK.
      const createdPurchase = await tx.trainingPurchase.create({
        data: {
          id: purchase.id, productId: purchase.productId, athleteId: purchase.athleteId,
          paymentRef: purchase.paymentRef, pricePaid: purchase.pricePaid,
          currency: purchase.currency, status: purchase.status,
          purchasedAt: purchase.purchasedAt,
        },
        select: { id: true, productId: true, athleteId: true, status: true, purchasedAt: true },
      });

      const createdLicense = await tx.trainingLicense.create({
        data: {
          id: license.id, productId: license.productId, versionId: license.versionId,
          purchaseId: license.purchaseId, athleteId: license.athleteId,
          status: license.status, startedAt: license.startedAt,
          expiresAt: license.expiresAt, revokedAt: license.revokedAt,
          calendarInstantiated: false,
        },
        select: { id: true, productId: true, versionId: true, athleteId: true, status: true, startedAt: true },
      });

      return { purchase: createdPurchase, license: createdLicense };
    });
  }
}
