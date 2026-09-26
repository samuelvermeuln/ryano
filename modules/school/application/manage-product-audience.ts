/**
 * Allow-list management for `visibility = PRIVATE` products — "criar produto
 * privado para apenas alguns alunos".
 *
 * Authorization reuses `CanManageTrainingProduct` (TM018) plus the same
 * "is this actually MY coach-owned product" check every other product
 * mutation performs (see update-training-product-draft.ts): the guard alone
 * only proves "an authorized professor", never "the professor who owns this
 * specific product".
 *
 * Granting access is NOT selling and NOT coaching: an audience row only makes
 * the product reachable/purchasable by that athlete. It creates no license, no
 * purchase, and no coach-athlete relationship (RNF-002).
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { trainingProductSchema } from "../domain/training-product";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageTrainingProduct } from "./can-manage-training-product";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const grantProductAudienceSchema = z.strictObject({
  productId: id,
  // The manager knows the athlete's e-mail, not their internal id — same
  // reasoning as AddSchoolMember. Exactly one of the two must be supplied.
  athleteId: id.optional(),
  email: z.string().trim().min(1).max(320).optional(),
  note: z.string().trim().min(1).max(500).nullish(),
}).superRefine((v, ctx) => {
  if (!v.athleteId === !v.email) {
    ctx.addIssue({ code: "custom", path: ["email"], message: "Informe o atleta ou o e-mail, nunca os dois." });
  }
});

export const revokeProductAudienceSchema = z.strictObject({ productId: id, athleteId: id });
export const listProductAudienceSchema = z.strictObject({ productId: id });

export interface ProductAudienceEntry {
  athleteId: string;
  name: string | null;
  email: string | null;
  note: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
}

/** Resolves and asserts the actor may manage this product; returns the stored row. */
async function assertManageableProduct(db: PrismaClient, actorUserId: string | null, productId: string) {
  const stored = await db.trainingProduct.findUnique({ where: { id: productId } });
  if (!stored) throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
  const product = trainingProductSchema.parse(stored);

  const guard = new CanManageTrainingProduct(db, new SchoolMembershipRepository(db));
  const { coachId } = await guard.assertAuthorCoach(actorUserId, product.schoolId);
  if (product.coachId && product.coachId !== coachId) {
    throw new SchoolError("FORBIDDEN", "Você não pode alterar este produto.", 403);
  }
  return product;
}

export class GrantProductAudience {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = grantProductAudienceSchema.parse(raw);
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    await assertManageableProduct(this.db, actor.data, input.productId);

    const athlete = input.athleteId
      ? await this.db.user.findUnique({ where: { id: input.athleteId }, select: { id: true } })
      : await this.db.user.findUnique({ where: { email: input.email!.toLowerCase() }, select: { id: true } });
    if (!athlete) throw new SchoolError("USER_NOT_FOUND", "Usuário não encontrado.", 404);

    const now = this.clock();
    // Re-granting revives the existing row instead of appending a second one,
    // which keeps "is this athlete allowed right now" a single-row lookup.
    return this.db.trainingProductAudience.upsert({
      where: { productId_athleteId: { productId: input.productId, athleteId: athlete.id } },
      create: {
        productId: input.productId,
        athleteId: athlete.id,
        grantedBy: actor.data,
        note: input.note ?? null,
        createdAt: now,
      },
      update: { revokedAt: null, grantedBy: actor.data, note: input.note ?? null },
    });
  }
}

export class RevokeProductAudience {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = revokeProductAudienceSchema.parse(raw);
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    await assertManageableProduct(this.db, actor.data, input.productId);

    const entry = await this.db.trainingProductAudience.findUnique({
      where: { productId_athleteId: { productId: input.productId, athleteId: input.athleteId } },
    });
    if (!entry) throw new SchoolError("PRODUCT_AUDIENCE_NOT_FOUND", "Este atleta não está na lista.", 404);
    if (entry.revokedAt) return entry;

    // Revoking removes future access only. Any license the athlete already
    // bought stays valid — losing access to the offer is not losing what was
    // already paid for.
    return this.db.trainingProductAudience.update({
      where: { id: entry.id },
      data: { revokedAt: this.clock() },
    });
  }
}

export class ListProductAudience {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<ProductAudienceEntry[]> {
    const input = listProductAudienceSchema.parse(raw);
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    await assertManageableProduct(this.db, actor.data, input.productId);

    const rows = await this.db.trainingProductAudience.findMany({
      where: { productId: input.productId },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "asc" }],
      select: {
        athleteId: true, note: true, createdAt: true, revokedAt: true,
        athlete: { select: { name: true, email: true } },
      },
    });

    return rows.map((row) => ({
      athleteId: row.athleteId,
      name: row.athlete.name,
      email: row.athlete.email,
      note: row.note,
      grantedAt: row.createdAt,
      revokedAt: row.revokedAt,
    }));
  }
}
