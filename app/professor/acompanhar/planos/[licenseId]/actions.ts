"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { ProposePlanAdaptation } from "@/modules/school/application/propose-plan-adaptation";

const propose = new ProposePlanAdaptation(prisma);

/**
 * TM083 — "Propor ajuste" form action (RF-303). Only ever calls
 * `ProposePlanAdaptation` — NEVER any product-editing use case (TM025/TM026
 * belong to the Estúdio, not to acompanhamento).
 */
export async function proposeAdaptationAction(licenseId: string, workoutAssignmentId: string, formData: FormData) {
  const session = await requireOnboardedSession();
  const reason = String(formData.get("reason") ?? "").trim();
  const scheduledAt = String(formData.get("scheduledAt") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion") ?? "0");

  try {
    await propose.execute(session.user.id, {
      licenseId,
      workoutAssignmentId,
      reason,
      expectedVersion,
      proposedChange: scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível propor o ajuste.";
    redirect(`/professor/acompanhar/planos/${licenseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/professor/acompanhar/planos/${licenseId}`);
  redirect(`/professor/acompanhar/planos/${licenseId}`);
}
