"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { TrainingProductVisibility } from "@/modules/school/domain/enums";
import { UpdateTrainingProductDraft } from "@/modules/school/application/update-training-product-draft";
import { PublishTrainingProductVersion } from "@/modules/school/application/publish-training-product-version";
import {
  GrantProductAudience,
  RevokeProductAudience,
} from "@/modules/school/application/manage-product-audience";

/**
 * Seller actions for `/professor/[schoolId]/marketplace`.
 *
 * Every mutation delegates to the same use cases the school panel uses, which
 * is what keeps authorization honest: `CanManageTrainingProduct` decides
 * whether this actor may touch this product. `schoolId` here is only the
 * shell's navigation context — it is NEVER used to widen what the coach may
 * edit, so opening the panel under a school does not grant reach over that
 * school's own products.
 */
const updateDraft = new UpdateTrainingProductDraft(prisma);
const publishVersion = new PublishTrainingProductVersion(prisma);
const grantAudience = new GrantProductAudience(prisma);
const revokeAudience = new RevokeProductAudience(prisma);

export type CoachMarketplaceActionState = { message?: string; ok?: boolean };

const idSchema = z.string().min(1);

function toState(error: unknown): CoachMarketplaceActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

function revalidateSellerPanel(schoolId: string) {
  revalidatePath(`/professor/${schoolId}/marketplace`);
  // The studio lists the same products, so leaving it cached would show the
  // coach two different answers to one question.
  revalidatePath("/professor/estudio/planos");
}

const visibilitySchema = z.object({
  schoolId: idSchema,
  productId: idSchema,
  // `updatedAt` as last rendered — TrainingProduct has no integer version
  // column, so it carries optimistic concurrency (RNF-003).
  expectedVersion: idSchema,
  visibility: z.enum(TrainingProductVisibility),
});

export async function updateCoachProductVisibilityAction(
  _prev: CoachMarketplaceActionState,
  formData: FormData,
): Promise<CoachMarketplaceActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = visibilitySchema.safeParse({
    schoolId: formData.get("schoolId"),
    productId: formData.get("productId"),
    expectedVersion: formData.get("expectedVersion"),
    visibility: formData.get("visibility"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await updateDraft.execute(session.user.id, {
      productId: parsed.data.productId,
      expectedVersion: parsed.data.expectedVersion,
      visibility: parsed.data.visibility,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateSellerPanel(parsed.data.schoolId);
  return { ok: true };
}

const priceSchema = z.object({
  schoolId: idSchema,
  productId: idSchema,
  expectedVersion: idSchema,
  /** Null means free — `priceCents = null` is the free marker, not zero (Q7). */
  priceCents: z.number().int().positive("O preço deve ser maior que zero.").nullable(),
});

export async function updateCoachProductPriceAction(
  _prev: CoachMarketplaceActionState,
  formData: FormData,
): Promise<CoachMarketplaceActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const rawPrice = formData.get("priceBrl");
  const text = typeof rawPrice === "string" ? rawPrice.trim().replace(",", ".") : "";
  const priceCents = text.length === 0 ? null : Math.round(Number(text) * 100);
  if (priceCents !== null && !Number.isFinite(priceCents)) {
    return { message: "Informe um preço válido." };
  }

  const parsed = priceSchema.safeParse({
    schoolId: formData.get("schoolId"),
    productId: formData.get("productId"),
    expectedVersion: formData.get("expectedVersion"),
    priceCents,
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    // priceCents and currency must move together — the domain rejects a price
    // without a currency and vice versa.
    await updateDraft.execute(session.user.id, {
      productId: parsed.data.productId,
      expectedVersion: parsed.data.expectedVersion,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.priceCents === null ? null : "BRL",
    });
  } catch (error) {
    return toState(error);
  }

  revalidateSellerPanel(parsed.data.schoolId);
  return { ok: true };
}

const publishSchema = z.object({ schoolId: idSchema, productId: idSchema });

export async function publishCoachProductAction(
  _prev: CoachMarketplaceActionState,
  formData: FormData,
): Promise<CoachMarketplaceActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = publishSchema.safeParse({
    schoolId: formData.get("schoolId"),
    productId: formData.get("productId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await publishVersion.execute(session.user.id, { productId: parsed.data.productId });
  } catch (error) {
    return toState(error);
  }

  revalidateSellerPanel(parsed.data.schoolId);
  return { ok: true };
}

const grantSchema = z.object({
  schoolId: idSchema,
  productId: idSchema,
  email: z.string().trim().min(1, "Informe o e-mail do atleta."),
  note: z.string().trim().max(500).optional(),
});

export async function grantCoachProductAudienceAction(
  _prev: CoachMarketplaceActionState,
  formData: FormData,
): Promise<CoachMarketplaceActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = grantSchema.safeParse({
    schoolId: formData.get("schoolId"),
    productId: formData.get("productId"),
    email: formData.get("email"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await grantAudience.execute(session.user.id, {
      productId: parsed.data.productId,
      email: parsed.data.email,
      note: parsed.data.note?.length ? parsed.data.note : null,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateSellerPanel(parsed.data.schoolId);
  return { ok: true };
}

const revokeSchema = z.object({
  schoolId: idSchema,
  productId: idSchema,
  athleteId: idSchema,
});

export async function revokeCoachProductAudienceAction(
  _prev: CoachMarketplaceActionState,
  formData: FormData,
): Promise<CoachMarketplaceActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = revokeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    productId: formData.get("productId"),
    athleteId: formData.get("athleteId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await revokeAudience.execute(session.user.id, {
      productId: parsed.data.productId,
      athleteId: parsed.data.athleteId,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateSellerPanel(parsed.data.schoolId);
  return { ok: true };
}
