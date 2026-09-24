import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createTrainingProduct } from "../domain/training-product";
import { TrainingProductVisibility } from "../domain/enums";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const createTrainingProductDraftSchema = z.strictObject({
  // TM019 (Q3) — the commercial owner is decided PER REQUEST by whether the
  // caller includes `schoolId`, never inferred/hardcoded from the actor's
  // profile. See the class doc comment below for the full reasoning.
  schoolId: id.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  sportType: z.string().trim().min(1).max(100).nullable().optional(),
  durationWeeks: z.number().int().min(1).max(520).nullable().optional(),
});
export type CreateTrainingProductDraftInput = z.infer<typeof createTrainingProductDraftSchema>;

/**
 * TM019 — Creates a `TrainingProduct` draft (`status=DRAFT`), owned by
 * exactly one of `schoolId` XOR `coachId` (RF-003, enforced again by the
 * domain schema and the DB CHECK from TM003).
 *
 * ## Q3 — "professor-em-escola: produto em nome próprio ou da escola" (open
 * in STATUS.md §7 at the time of this task)
 *
 * Resolved here as: **the actor decides per request**, by including or
 * omitting `schoolId` in the payload — never inferred from the actor's
 * profile or hardcoded to "always the school" or "always the coach".
 *
 *   - `schoolId` present → the product is commercially owned by that school.
 *     The actor must be OWNER/ADMIN of *that specific* school (via
 *     `CanManageTrainingProduct`/`CanManageSchool`, TM018) — the same bar as
 *     managing the school itself, since this is a business/revenue decision,
 *     not a personal one.
 *   - `schoolId` omitted → the product is owned by the actor's own
 *     `CoachProfile` (`coachId`), i.e. "produto em nome próprio". Any active
 *     coach can do this, independent of any school affiliation — a coach
 *     employed by a school is free to also sell in their own name.
 *
 * This is a reasonable default, not a final product decision: it keeps
 * revenue/continuity attribution unambiguous per-product (a product is never
 * silently reassigned between "the school" and "the coach" — RF-003's XOR is
 * fixed at creation) while not requiring a coach-in-school to get product
 * approval from the school for every personal product, and not letting a
 * coach unilaterally claim school revenue for a product the school didn't
 * authorize. If product wants a different default (e.g. "coach-in-school
 * products always belong to the school unless opted out"), that changes only
 * this use case, not the schema or TM018's guard.
 */
export class CreateTrainingProductDraft {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = createTrainingProductDraftSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const guard = new CanManageTrainingProduct(tx, new SchoolMembershipRepository(tx));
        const { coachId } = await guard.assertAuthorCoach(actorUserId, input.schoolId ?? null);

        if (input.schoolId) {
          const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { status: true } });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        }

        const now = this.clock();
        const product = createTrainingProduct({
          id: randomUUID(),
          schoolId: input.schoolId ?? null,
          coachId: input.schoolId ? null : coachId,
          title: input.title,
          description: input.description ?? null,
          sportType: input.sportType ?? null,
          durationWeeks: input.durationWeeks ?? null,
          visibility: TrainingProductVisibility.PUBLIC,
          priceCents: null,
          currency: null,
        }, now);

        return tx.trainingProduct.create({ data: product });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("PRODUCT_UPDATE_CONFLICT", "Não foi possível criar o produto. Tente novamente.", 409);
      }
      throw error;
    }
  }
}
