"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { ActivateTrainingLicense } from "@/modules/school/application/activate-training-license";
import { InviteCoachToLicense } from "@/modules/school/application/invite-coach-to-license";
import { DecidePlanAdaptation } from "@/modules/school/application/decide-plan-adaptation";
import { RevokeCoachEngagement } from "@/modules/school/application/revoke-coach-engagement";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";

const activate = new ActivateTrainingLicense(prisma);
const invite = new InviteCoachToLicense(prisma);
const decideAdaptation = new DecidePlanAdaptation(prisma);
const revokeEngagement = new RevokeCoachEngagement(prisma);

/** TM044 — "Escolher início" action on /app/planos/[licenseId] (RF-109), confirm-only (no interactive preview step yet — see page.tsx doc). */
export async function activateLicenseAction(licenseId: string, formData: FormData) {
  const session = await requireOnboardedSession();
  const mode = String(formData.get("mode") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const startLocalDate = String(formData.get("startLocalDate") ?? "").trim();
  const targetEventDate = String(formData.get("targetEventDate") ?? "").trim();

  try {
    await activate.execute(session.user.id, {
      licenseId,
      mode,
      timezone,
      ...(startLocalDate ? { startLocalDate } : {}),
      ...(targetEventDate ? { targetEventDate } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ativar o plano.";
    redirect(`/app/planos/${licenseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/app/planos/${licenseId}`);
  revalidatePath("/app/planos");
  redirect(`/app/planos/${licenseId}`);
}

/**
 * TM084 (RF-301) — "Convidar professor acompanhante" on the "Permissões de
 * acompanhamento" card. `coachId` is a raw `CoachProfile.id` typed by the
 * athlete — this Onda has no coach search/directory UI yet (out of scope;
 * task-list.md TM084 only requires accept/decline/revoke on the
 * already-present cards, this form closes RF-301's "explicit invite" loop
 * with the smallest possible input surface).
 */
export async function inviteCoachAction(licenseId: string, formData: FormData) {
  const session = await requireOnboardedSession();
  const coachId = String(formData.get("coachId") ?? "").trim();
  const scopeMode = String(formData.get("scopeMode") ?? "full");
  const sportTypesRaw = String(formData.get("sportTypes") ?? "");
  const sportTypes = sportTypesRaw.split(",").map((s) => s.trim()).filter(isRyvanoSportType);

  try {
    await invite.execute(session.user.id, {
      licenseId,
      coachId,
      scope: scopeMode === "partial" ? { sportTypes } : { full: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar o convite.";
    redirect(`/app/planos/${licenseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/app/planos/${licenseId}`);
  redirect(`/app/planos/${licenseId}`);
}

/** TM084 (RF-304) — "Revogar acesso" on the "Permissões de acompanhamento" card. */
export async function revokeCoachEngagementAction(licenseId: string, coachId: string) {
  const session = await requireOnboardedSession();
  try {
    await revokeEngagement.execute(session.user.id, { licenseId, coachId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível revogar o acompanhamento.";
    redirect(`/app/planos/${licenseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/app/planos/${licenseId}`);
  redirect(`/app/planos/${licenseId}`);
}

/** TM084 (RF-303) — "Aceitar"/"Recusar" on the "Histórico de ajustes" card. */
export async function decideAdaptationAction(licenseId: string, adaptationId: string, decision: "ACCEPT" | "DECLINE") {
  const session = await requireOnboardedSession();
  try {
    await decideAdaptation.execute(session.user.id, { licenseId, adaptationId, decision });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível decidir sobre o ajuste.";
    redirect(`/app/planos/${licenseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/app/planos/${licenseId}`);
  redirect(`/app/planos/${licenseId}`);
}
