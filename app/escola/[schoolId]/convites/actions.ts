"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { InvitationType } from "@/modules/school/domain/enums";
import { CreateInvitationLink } from "@/modules/school/application/create-invitation-link";
import { RevokeInvitation } from "@/modules/school/application/revoke-invitation";

const createInvitation = new CreateInvitationLink(prisma);
const revokeInvitation = new RevokeInvitation(prisma);

/**
 * `token` is present only in the response of a successful creation and is
 * never persisted in readable form (`InvitationLink` stores a hash). The UI
 * must show it once, at that moment — it cannot be recovered afterwards, by
 * this screen or anything else.
 */
export type InviteActionState = { message?: string; ok?: boolean; token?: string };

const idSchema = z.string().min(1);

function toState(error: unknown): InviteActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

const createSchema = z.object({
  schoolId: idSchema,
  // Only school-scoped invitations are issued from this screen; a COACH
  // invitation has no school and belongs to the coach's own area.
  type: z.enum([InvitationType.SCHOOL, InvitationType.SCHOOL_COACH]),
  requiresApproval: z.boolean(),
  expiresInDays: z.number().int().positive().max(365).nullable(),
  maxUses: z.number().int().positive().max(10_000).nullable(),
});

function optionalPositiveInt(value: FormDataEntryValue | null): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function createInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = createSchema.safeParse({
    schoolId: formData.get("schoolId"),
    type: formData.get("type"),
    requiresApproval: formData.get("requiresApproval") === "on",
    expiresInDays: optionalPositiveInt(formData.get("expiresInDays")),
    maxUses: optionalPositiveInt(formData.get("maxUses")),
  });
  if (!parsed.success) return toState(parsed.error);

  const { schoolId, type, requiresApproval, expiresInDays, maxUses } = parsed.data;

  let token: string;
  try {
    const result = await createInvitation.execute(session.user.id, {
      type,
      schoolId,
      requiresApproval,
      expiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 86_400_000),
      maxUses,
    });
    token = result.token;
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/escola/${schoolId}/convites`);
  return { ok: true, token };
}

const revokeSchema = z.object({ schoolId: idSchema, invitationId: idSchema });

export async function revokeInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = revokeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    invitationId: formData.get("invitationId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await revokeInvitation.execute(session.user.id, { invitationId: parsed.data.invitationId });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/escola/${parsed.data.schoolId}/convites`);
  return { ok: true };
}
