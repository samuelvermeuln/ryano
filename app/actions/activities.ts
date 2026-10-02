"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

/**
 * SAM-40 — the editorial title of an activity (`Activity.title`): what the
 * athlete calls it, separate from the provider's `name`. Only the owner
 * writes it; an empty title clears it (the provider's name shows again).
 * The card-layout action of the old dashboard was removed with the dashboard
 * (the screen has no reorderable cards any more).
 */
const renameSchema = z.object({
  activityId: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120),
});

export type RenameActivityActionState = {
  success?: boolean;
  message?: string;
};

export async function renameActivityTitleAction(input: {
  activityId: string;
  title: string;
}): Promise<RenameActivityActionState> {
  const session = await requireSession();
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Título inválido." };
  }

  const updated = await prisma.activity.updateMany({
    where: { id: parsed.data.activityId, userId: session.user.id },
    data: { title: parsed.data.title.length > 0 ? parsed.data.title : null },
  });
  if (updated.count === 0) {
    return { message: "Só o atleta dono da atividade pode renomeá-la." };
  }

  revalidatePath(`/app/atividades/${parsed.data.activityId}`);
  return { success: true, message: parsed.data.title.length > 0 ? "Título salvo." : "Título removido." };
}
