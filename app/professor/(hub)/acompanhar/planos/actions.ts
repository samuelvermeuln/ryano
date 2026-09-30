"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AcceptCoachInvitation } from "@/modules/school/application/accept-coach-invitation";

const accept = new AcceptCoachInvitation(prisma);

/** TM082 — "Aceitar" on a pending invite card (RF-302). */
export async function acceptCoachInvitationAction(engagementId: string) {
  const session = await requireOnboardedSession();
  try {
    await accept.execute(session.user.id, { engagementId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível aceitar o convite.";
    redirect(`/professor/acompanhar/planos?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/professor/acompanhar/planos");
  redirect("/professor/acompanhar/planos");
}
