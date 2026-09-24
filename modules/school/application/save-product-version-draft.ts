import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { trainingProductSchema } from "../domain/training-product";
import { parsePlanPayload } from "../domain/training-product-version";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const saveProductVersionDraftSchema = z.strictObject({
  productId: id,
  // New drafts default to the multimodal format (TM010, RF-005); explicit
  // for callers that still exercise the legacy shape in tests/tooling.
  schemaVersion: z.number().int().min(1).default(2),
  planPayload: z.unknown(),
  changeNote: z.string().max(1000).nullable().optional(),
});
export type SaveProductVersionDraftInput = z.infer<typeof saveProductVersionDraftSchema>;

/**
 * TM021 — Editor persistence: assembles/saves the `weeks[] → days[] →
 * sessions[]` draft for a product (RF-102, RF-005).
 *
 * At most one *unpublished* `TrainingProductVersion` exists per product at a
 * time (`publishedAt IS NULL`) — this is that row. The first call for a
 * product creates it (`versionNumber` = max existing + 1); every later call
 * updates it in place, since a draft (unlike a published version, TM004) is
 * still mutable. `PublishTrainingProductVersion` (TM022) is what freezes it.
 *
 * What this use case deliberately does NOT do: verify that every
 * `workoutTemplateId` referenced in the payload exists and belongs to the
 * author/school. That full check is TM022's job, at publish time — a draft
 * is allowed to be incomplete/exploratory while the professor is still
 * assembling it (RF-102 "preview... antes de publicar"); only publishing has
 * to be airtight (RF-103).
 *
 * "Duplicar semana" (RF-102) needs no server logic beyond this: the editor
 * builds the whole `planPayload` (weeks/days/sessions) client-side —
 * including any duplicated week — and this use case simply validates and
 * persists it. `duplicatePlanWeek` (training-product-version.ts) is the
 * pure helper for that cloning step; per the TM010 convention it verifies
 * (planSessionId is a stable per-slot identifier, not a globally-unique
 * row id), it intentionally keeps the same session ids under the new week.
 */
export class SaveProductVersionDraft {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = saveProductVersionDraftSchema.parse(raw);
    // Validate before touching the DB — an invalid payload never reaches a write.
    parsePlanPayload(input.schemaVersion, input.planPayload);

    try {
      return await this.db.$transaction(async (tx) => {
        const storedProduct = await tx.trainingProduct.findUnique({ where: { id: input.productId } });
        if (!storedProduct) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
        const product = trainingProductSchema.parse(storedProduct);

        const guard = new CanManageTrainingProduct(tx, new SchoolMembershipRepository(tx));
        const { coachId } = await guard.assertAuthorCoach(actorUserId, product.schoolId);
        if (product.coachId && product.coachId !== coachId) {
          throw new SchoolError("FORBIDDEN", "Você não pode alterar este produto.", 403);
        }

        const now = this.clock();
        const changeNote = input.changeNote ?? null;

        const existingDraft = await tx.trainingProductVersion.findFirst({
          where: { productId: product.id, publishedAt: null },
          orderBy: { versionNumber: "desc" },
        });

        if (existingDraft) {
          return tx.trainingProductVersion.update({
            where: { id: existingDraft.id },
            data: { schemaVersion: input.schemaVersion, planPayload: input.planPayload as Prisma.InputJsonValue, changeNote },
          });
        }

        const highest = await tx.trainingProductVersion.aggregate({
          where: { productId: product.id },
          _max: { versionNumber: true },
        });
        const nextVersionNumber = (highest._max.versionNumber ?? 0) + 1;

        return tx.trainingProductVersion.create({
          data: {
            id: randomUUID(),
            productId: product.id,
            versionNumber: nextVersionNumber,
            schemaVersion: input.schemaVersion,
            planPayload: input.planPayload as Prisma.InputJsonValue,
            changeNote,
            publishedAt: null,
            createdAt: now,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("PRODUCT_UPDATE_CONFLICT", "O rascunho foi alterado em paralelo. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
