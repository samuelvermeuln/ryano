import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { TrainingPurchaseStatus, TrainingLicenseStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";

export const createMarketplaceReviewSchema = z.strictObject({
  productId: z.string().min(1),
  purchaseId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type CreateMarketplaceReviewInput = z.infer<typeof createMarketplaceReviewSchema>;

/**
 * TM047 (RF-112) — creates or edits the athlete's CURRENT review for a
 * purchase. "Segunda avaliação da mesma compra edita a existente, não cria
 * outra" (task-list.md criterio): this is an upsert keyed on the DB's own
 * `@@unique([purchaseId, athleteId, productId])` (migration 0042), not a
 * second application-level uniqueness check that could drift from it.
 *
 * Q6 (review moderation criteria) decided here: reviews are created
 * `APPROVED` immediately — this repo has no moderation queue/admin route in
 * this Onda, and the product spec's own wording ("permitir denúncia/
 * moderação") reads as post-hoc (report-then-moderate), not pre-moderation
 * that would leave every review invisible until a human acts. `moderationStatus`
 * still supports `REJECTED` for a future report-handling flow to set. This is
 * an engineering default — STATUS.md §7 flags Q6 as still open for Product
 * to confirm or override.
 */
export class CreateMarketplaceReview {
  constructor(
    private readonly db: Pick<PrismaClient, "trainingPurchase" | "trainingLicense" | "workoutExecution" | "trainingProduct" | "coachProfile" | "marketplaceReview">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(athleteId: string, raw: unknown) {
    const input = createMarketplaceReviewSchema.parse(raw);
    const now = this.clock();

    const purchase = await this.db.trainingPurchase.findUnique({
      where: { id: input.purchaseId },
      select: { id: true, productId: true, athleteId: true, status: true, versionId: true },
    });
    if (!purchase || purchase.athleteId !== athleteId || purchase.productId !== input.productId) {
      // Same code for "not found" and "belongs to someone else" — never confirm existence of another athlete's purchase.
      throw new SchoolError("REVIEW_NOT_ELIGIBLE", "Compra não encontrada para este produto.", 403);
    }
    if (purchase.status !== TrainingPurchaseStatus.COMPLETED) {
      throw new SchoolError("REVIEW_NOT_ELIGIBLE", "A compra ainda não foi concluída.", 403);
    }
    if (!purchase.versionId) {
      throw new SchoolError("REVIEW_NOT_ELIGIBLE", "Compra sem versão associada.", 403);
    }

    const license = await this.db.trainingLicense.findFirst({
      where: { purchaseId: purchase.id, athleteId },
      select: { id: true, status: true },
    });
    // "Licença ativa" (task text) interpreted broadly: ACTIVE/PAUSED/COMPLETED
    // are all legitimate in-use-or-finished states; REVOKED/EXPIRED are not.
    const eligibleStatuses: string[] = [TrainingLicenseStatus.ACTIVE, TrainingLicenseStatus.PAUSED, TrainingLicenseStatus.COMPLETED];
    if (!license || !eligibleStatuses.includes(license.status)) {
      throw new SchoolError("REVIEW_NOT_ELIGIBLE", "Licença não está em uso.", 403);
    }

    const hasExecution = await this.db.workoutExecution.findFirst({
      where: { assignment: { trainingLicenseId: license.id } },
      select: { id: true },
    });
    if (!hasExecution) {
      throw new SchoolError("REVIEW_NOT_ELIGIBLE", "Registre ao menos uma sessão antes de avaliar.", 403);
    }

    const product = await this.db.trainingProduct.findUnique({
      where: { id: input.productId },
      select: { id: true, coachId: true },
    });
    if (!product) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
    if (product.coachId) {
      // Self-review block. Only checkable for the independent-coach case:
      // TrainingProduct.schoolId/coachId are XOR (migration 0036 CHECK), so a
      // school-owned product (coachId=null) has no single "author" user to
      // compare against in the current schema — same gap GetMarketplaceProductDetail
      // already documents for author/seller. Not attempting to block school staff here.
      const authorCoach = await this.db.coachProfile.findUnique({ where: { id: product.coachId }, select: { userId: true } });
      if (authorCoach?.userId === athleteId) {
        throw new SchoolError("REVIEW_NOT_ELIGIBLE", "O autor não pode avaliar o próprio produto.", 403);
      }
    }

    const existing = await this.db.marketplaceReview.findUnique({
      where: { purchaseId_athleteId_productId: { purchaseId: purchase.id, athleteId, productId: input.productId } },
    });

    if (existing) {
      return this.db.marketplaceReview.update({
        where: { id: existing.id },
        data: { stars: input.stars, comment: input.comment ?? null, updatedAt: now },
      });
    }

    try {
      const created = await this.db.marketplaceReview.create({
        data: {
          productId: input.productId,
          purchaseId: purchase.id,
          athleteId,
          versionId: purchase.versionId,
          stars: input.stars,
          comment: input.comment ?? null,
          moderationStatus: "APPROVED",
          createdAt: now,
          updatedAt: now,
        },
      });
      // TM052 (RNF-008) — only the genuine-creation path, not edits of an existing review.
      schoolMetrics.marketplaceReviewCreated({ productId: input.productId, reviewId: created.id, stars: input.stars });
      return created;
    } catch (err) {
      // Race: two concurrent requests both saw no `existing` row. The unique
      // index (migration 0042) rejects the second insert — surface it as the
      // same "edit, don't duplicate" outcome rather than a raw DB error.
      if (isUniqueConstraintError(err)) {
        throw new SchoolError("REVIEW_ALREADY_EXISTS", "Avaliação já existe para esta compra.", 409);
      }
      throw err;
    }
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}
