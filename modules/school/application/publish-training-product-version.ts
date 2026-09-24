import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { trainingProductSchema } from "../domain/training-product";
import { parsePlanPayload, type PlanPayload, type PlanPayloadV2 } from "../domain/training-product-version";
import { TrainingProductStatus } from "../domain/enums";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { schoolMetrics } from "../infrastructure/metrics";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const publishTrainingProductVersionSchema = z.strictObject({ productId: id });
export type PublishTrainingProductVersionInput = z.infer<typeof publishTrainingProductVersionSchema>;

function collectWorkoutTemplateIds(payload: PlanPayload | PlanPayloadV2): string[] {
  const ids = new Set<string>();
  for (const week of payload.weeks) {
    for (const day of week.days) {
      if ("workoutTemplateId" in day) {
        ids.add(day.workoutTemplateId);
      } else {
        for (const session of day.sessions) ids.add(session.workoutTemplateId);
      }
    }
  }
  return [...ids];
}

/**
 * TM022 — Publishes the product's current draft `TrainingProductVersion`
 * (RF-103): verifies every referenced `workoutTemplateId` exists and belongs
 * to the author/school, then freezes the row (`publishedAt`, `contentHash`)
 * and points `TrainingProduct.currentVersionId` at it.
 *
 * "License de uso" (a third party licensing a template for reuse, mentioned
 * in requirements.md as an alternative to author/school ownership) has no
 * modeled entity anywhere in this codebase yet — only "belongs to the
 * author or the school" is checked here. Adding a template-licensing
 * concept would need new schema, which is explicitly out of scope for this
 * task (Onda 0's migrations are closed; a new migration needs central
 * coordination) — left for a future task if product needs it.
 *
 * Snapshot survival (RF-103, "sobrevive ao arquivamento do template de
 * origem"): archiving a `WorkoutTemplate` only flips its `status` to
 * ARCHIVED (see archive-workout-template.ts) — the row itself is never
 * deleted. Combined with TM004's immutability trigger (the published
 * `planPayload`, including its `workoutTemplateId` references, can never
 * change again), the reference stays resolvable indefinitely; this use case
 * therefore checks existence + ownership only, never `status`, so an
 * already-ARCHIVED template is still a valid publish-time reference.
 *
 * ## Q4 — "direito de atualização de versão para quem já comprou" (open in
 * STATUS.md §7 at the time of this task)
 *
 * NOT implemented here, by design: publishing a new version only moves
 * `TrainingProduct.currentVersionId` forward for *future* purchases/licenses.
 * It never touches any existing `TrainingLicense.versionId` — every athlete
 * who already holds a license keeps the exact version they licensed,
 * forever (consistent with RF-004 immutability and with `TrainingLicense`
 * having no "current version" concept, TM006). An opt-in "upgrade my
 * license to the new version" flow is a distinct, larger feature (it would
 * need to re-run/diff calendar instantiation against a different version)
 * that has no use case anywhere in this task list — left for a future task.
 * The conservative default (no forced or automatic upgrade, ever) is safe
 * to ship without it.
 */
export class PublishTrainingProductVersion {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = publishTrainingProductVersionSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const storedProduct = await tx.trainingProduct.findUnique({ where: { id: input.productId } });
        if (!storedProduct) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
        const product = trainingProductSchema.parse(storedProduct);

        const guard = new CanManageTrainingProduct(tx, new SchoolMembershipRepository(tx));
        const { coachId } = await guard.assertAuthorCoach(actorUserId, product.schoolId);
        if (product.coachId && product.coachId !== coachId) {
          throw new SchoolError("FORBIDDEN", "Você não pode publicar este produto.", 403);
        }

        const draft = await tx.trainingProductVersion.findFirst({
          where: { productId: product.id, publishedAt: null },
          orderBy: { versionNumber: "desc" },
        });
        if (!draft) throw new SchoolError("VERSION_NOT_FOUND", "Nenhuma versão em rascunho para publicar.", 404);

        const payload = parsePlanPayload(draft.schemaVersion, draft.planPayload);
        const templateIds = collectWorkoutTemplateIds(payload);

        if (templateIds.length > 0) {
          const templates = await tx.workoutTemplate.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, ownerType: true, authorCoachId: true, schoolId: true },
          });
          const templateById = new Map(templates.map((t) => [t.id, t]));

          for (const templateId of templateIds) {
            const template = templateById.get(templateId);
            if (!template) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Template referenciado não encontrado.", 404);

            const ownershipMatches = product.coachId
              ? template.authorCoachId === product.coachId
              : template.schoolId === product.schoolId;
            if (!ownershipMatches) {
              throw new SchoolError("WORKOUT_TEMPLATE_NOT_ACCESSIBLE", "Template referenciado não pertence ao autor ou à escola do produto.", 403);
            }
          }
        }

        const now = this.clock();
        const contentHash = createHash("sha256").update(JSON.stringify(draft.planPayload)).digest("hex");

        const publishedVersion = await tx.trainingProductVersion.update({
          // `publishedAt: null` doubles as an idempotency guard: a second,
          // concurrent publish of the same draft finds 0 matching rows and
          // fails with P2025, mapped below to a 409 — never a double-publish.
          where: { id: draft.id, publishedAt: null },
          data: { publishedAt: now, contentHash },
        });

        await tx.trainingProduct.update({
          where: { id: product.id },
          data: { currentVersionId: publishedVersion.id, status: TrainingProductStatus.PUBLISHED, updatedAt: now },
        });

        // TM052 (RNF-008) — inside the transaction, but metrics never throw
        // (fire-and-forget `emit`), so this cannot roll back the publish.
        schoolMetrics.marketplaceProductPublished({
          productId: product.id, versionId: publishedVersion.id,
          coachId: product.coachId ?? undefined, schoolId: product.schoolId ?? undefined,
        });

        return publishedVersion;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("PRODUCT_UPDATE_CONFLICT", "Este rascunho já foi publicado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
