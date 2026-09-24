import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { trainingProductSchema } from "../domain/training-product";
import { TrainingProductVisibility } from "../domain/enums";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const isoDate = z.union([z.iso.datetime({ offset: true }), z.date()]).transform((v) => new Date(v));

export const updateTrainingProductDraftSchema = z.strictObject({
  productId: id,
  // RNF-003 — optimistic concurrency: the product's `updatedAt` as last read
  // by the client. No integer `version` column exists on `TrainingProduct`,
  // so `updatedAt` (millisecond-precision `timestamptz(3)`) plays that role,
  // the same way `SchoolMembershipRepository.updateStatus` already uses it.
  expectedVersion: isoDate,
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  sportType: z.string().trim().min(1).max(100).nullable().optional(),
  durationWeeks: z.number().int().min(1).max(520).nullable().optional(),
  visibility: z.enum(TrainingProductVisibility).optional(),
  /** Both must be provided together (or both omitted) — see `priceCents`/`currency` XOR-with-null rule below. */
  priceCents: z.number().int().positive().nullable().optional(),
  currency: z.string().length(3).toUpperCase().nullable().optional(),
  slug: z.string().trim().max(220).nullable().optional(),
  coverMediaId: id.nullable().optional(),
  objective: z.string().trim().max(300).nullable().optional(),
  difficulty: z.string().trim().max(50).nullable().optional(),
  goalType: z.string().trim().max(50).nullable().optional(),
  targetEventType: z.string().trim().max(50).nullable().optional(),
  targetDistance: z.string().trim().max(50).nullable().optional(),
  sessionsPerWeek: z.number().int().min(0).max(28).nullable().optional(),
  sessionDurationMin: z.number().int().min(0).nullable().optional(),
  sessionDurationMax: z.number().int().min(0).nullable().optional(),
  weeklyMinutesMin: z.number().int().min(0).nullable().optional(),
  weeklyMinutesMax: z.number().int().min(0).nullable().optional(),
  sessionCount: z.number().int().min(0).nullable().optional(),
  equipment: z.string().trim().max(500).nullable().optional(),
  language: z.string().trim().max(10).nullable().optional(),
  availability: z.string().trim().max(100).nullable().optional(),
  sellerPolicyVersion: z.string().trim().max(50).nullable().optional(),
  previewVersionId: id.nullable().optional(),
});
export type UpdateTrainingProductDraftInput = z.infer<typeof updateTrainingProductDraftSchema>;

const PATCHABLE_KEYS = [
  "title", "description", "sportType", "durationWeeks", "visibility", "priceCents", "currency",
  "slug", "coverMediaId", "objective", "difficulty", "goalType", "targetEventType", "targetDistance",
  "sessionsPerWeek", "sessionDurationMin", "sessionDurationMax", "weeklyMinutesMin", "weeklyMinutesMax",
  "sessionCount", "equipment", "language", "availability", "sellerPolicyVersion", "previewVersionId",
] as const;

/**
 * TM020 — Edits a `TrainingProduct`'s catalog/commercial metadata (never its
 * `schoolId`/`coachId` ownership, which is fixed at creation — TM019/Q3).
 * Only the product's authorized owner may edit (TM018's guard, plus an
 * explicit "is this actually *my* product" check for coach-owned products,
 * since the guard alone only proves "an authorized professor", not "the
 * professor who owns this specific product").
 */
export class UpdateTrainingProductDraft {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = updateTrainingProductDraftSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const stored = await tx.trainingProduct.findUnique({ where: { id: input.productId } });
        if (!stored) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
        const current = trainingProductSchema.parse(stored);

        const guard = new CanManageTrainingProduct(tx, new SchoolMembershipRepository(tx));
        const { coachId } = await guard.assertAuthorCoach(actorUserId, current.schoolId);
        // School-owned: OWNER/ADMIN of `current.schoolId` was just asserted above, which is
        // sufficient. Coach-owned: the guard only proves "an authorized active coach", not
        // "the coach who owns THIS product" — that check is specific to update/delete and
        // belongs here, not in the reusable guard.
        if (current.coachId && current.coachId !== coachId) {
          throw new SchoolError("FORBIDDEN", "Você não pode alterar este produto.", 403);
        }

        if ((input.priceCents !== undefined || input.currency !== undefined)
          && (input.priceCents ?? current.priceCents) !== null !== ((input.currency ?? current.currency) !== null)) {
          throw new SchoolError("INVALID_INPUT", "priceCents e currency devem ser ambos nulos ou ambos preenchidos.", 400);
        }

        const now = this.clock();
        const patch: Record<string, unknown> = { updatedAt: now };
        for (const key of PATCHABLE_KEYS) {
          if (input[key] !== undefined) patch[key] = input[key];
        }

        const updated = await tx.trainingProduct.update({
          // Extended unique where (id + updatedAt) — mirrors
          // SchoolMembershipRepository.updateStatus: fails with Prisma P2025
          // if another writer changed the row since `expectedVersion` was read.
          where: { id: current.id, updatedAt: input.expectedVersion },
          data: patch,
        });
        return trainingProductSchema.parse(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("PRODUCT_UPDATE_CONFLICT", "O produto foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
