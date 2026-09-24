import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createTrainingPurchase } from "../domain/training-purchase";
import { createTrainingLicense } from "../domain/training-license";
import { TrainingProductStatus, TrainingPurchaseStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";
import { assertProductPurchasable } from "./assert-product-purchasable";

export const acquireFreeTrainingProductSchema = z.strictObject({
  productId: z.string().min(1),
});
export type AcquireFreeTrainingProductInput = z.infer<typeof acquireFreeTrainingProductSchema>;

export interface AcquireFreeTrainingProductRepository {
  trainingProduct: Pick<PrismaClient["trainingProduct"], "findUnique">;
  trainingPurchase: Pick<PrismaClient["trainingPurchase"], "findUnique" | "create">;
  trainingLicense: Pick<PrismaClient["trainingLicense"], "findFirst" | "create">;
  schoolAthleteMembership: Pick<PrismaClient["schoolAthleteMembership"], "findFirst">;
  $transaction: PrismaClient["$transaction"];
}

/**
 * TM038 (RF-108, design D-02) — the free-only half of the former
 * `CreateTrainingPurchase`. Never accepts `paymentRef`; rejects any product
 * whose `priceCents` is not null (Q7: null = free, decided in TM003). The
 * paid half (`paymentRef`/webhook-verified confirmation) is
 * `ConfirmTrainingPurchaseFromWebhook` — TM060, Onda 2, not built here.
 *
 * Idempotent per (productId, athleteId): `TrainingPurchase.checkoutId` is
 * `@unique` in the schema (migration 0038) — this is the only unique index
 * available for a purchase row without a new migration, so the free path
 * reuses it with a deterministic value (`free:<productId>:<athleteId>`)
 * instead of a client-supplied checkout session id. A retry/double-tab (or a
 * genuine race between two concurrent requests) either finds the row that
 * already exists, or loses a unique-constraint race on create and then reads
 * the winner's row — either way exactly one purchase+license exists per pair.
 */
export class AcquireFreeTrainingProduct {
  constructor(
    private readonly db: AcquireFreeTrainingProductRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(athleteId: string, raw: unknown) {
    const input = acquireFreeTrainingProductSchema.parse(raw);
    const now = this.clock();
    const checkoutId = freeCheckoutId(input.productId, athleteId);

    return this.db.$transaction(async (tx) => {
      const product = await tx.trainingProduct.findUnique({
        where: { id: input.productId },
        select: { id: true, status: true, priceCents: true, currency: true, currentVersionId: true, visibility: true, schoolId: true },
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
      // TM058 (RF-201/RF-105) — SCHOOL_ONLY eligibility; a gap this task
      // found shared by both the free and paid acquisition paths.
      await assertProductPurchasable(tx, athleteId, product);
      // RF-108 is exclusive to priceCents=null; a paid product must go
      // through checkout/webhook confirmation, never this free-only path.
      if (product.priceCents !== null) {
        throw new SchoolError("PRODUCT_NOT_FREE", "Este produto é pago — use o checkout.", 409);
      }

      const existingPurchase = await tx.trainingPurchase.findUnique({
        where: { checkoutId },
        select: { id: true, productId: true, athleteId: true, status: true, purchasedAt: true },
      });
      if (existingPurchase) {
        const existingLicense = await tx.trainingLicense.findFirst({
          where: { purchaseId: existingPurchase.id },
          select: { id: true, productId: true, versionId: true, athleteId: true, status: true, startedAt: true },
        });
        if (!existingLicense) {
          // Defensive: a purchase without its license should be impossible
          // (RF-002 — same transaction, sequential writes) — surface loudly
          // rather than silently minting a second license for it.
          throw new SchoolError("SYSTEM", "Compra gratuita sem licença correspondente.", 500);
        }
        return { purchase: existingPurchase, license: existingLicense, alreadyAcquired: true };
      }

      const purchaseId = randomUUID();
      const purchase = createTrainingPurchase(
        {
          id: purchaseId,
          productId: product.id,
          athleteId,
          paymentRef: null,
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
          startedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
        now,
      );

      let createdPurchase: { id: string; productId: string; athleteId: string; status: string; purchasedAt: Date };
      try {
        // TM002/RF-002 discipline preserved: purchase is awaited/committed
        // before the license (its FK target) is created — no Promise.all.
        createdPurchase = await tx.trainingPurchase.create({
          data: {
            id: purchase.id, productId: purchase.productId, athleteId: purchase.athleteId,
            versionId: product.currentVersionId,
            paymentRef: purchase.paymentRef, pricePaid: purchase.pricePaid,
            currency: purchase.currency, status: purchase.status,
            purchasedAt: purchase.purchasedAt, checkoutId,
          },
          select: { id: true, productId: true, athleteId: true, status: true, purchasedAt: true },
        });
      } catch (error) {
        // Lost a race on the checkoutId unique constraint: another request
        // for the same (productId, athleteId) committed first. Read its row
        // back instead of failing — this is what makes the pair idempotent
        // under genuine concurrency, not just sequential retries.
        if (isUniqueConstraintViolation(error)) {
          const winner = await tx.trainingPurchase.findUnique({
            where: { checkoutId },
            select: { id: true, productId: true, athleteId: true, status: true, purchasedAt: true },
          });
          if (winner) {
            const winnerLicense = await tx.trainingLicense.findFirst({
              where: { purchaseId: winner.id },
              select: { id: true, productId: true, versionId: true, athleteId: true, status: true, startedAt: true },
            });
            if (winnerLicense) {
              return { purchase: winner, license: winnerLicense, alreadyAcquired: true };
            }
          }
        }
        throw error;
      }

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

      // TM052 (RNF-008) — only the genuine-creation path, not idempotent retries.
      schoolMetrics.marketplacePurchaseFreeCompleted({
        productId: createdPurchase.productId, purchaseId: createdPurchase.id,
        licenseId: createdLicense.id, athleteId: createdLicense.athleteId,
      });

      return { purchase: createdPurchase, license: createdLicense, alreadyAcquired: false };
    });
  }
}

/** Deterministic per-(productId, athleteId) checkout id for the free path (see class doc). */
function freeCheckoutId(productId: string, athleteId: string): string {
  return `free:${productId}:${athleteId}`;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
