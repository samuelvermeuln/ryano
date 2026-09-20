"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { LogUnplannedWorkout } from "@/modules/school/application/log-unplanned-workout";
import { RequestWorkout } from "@/modules/school/application/request-workout";
import { prisma } from "@/server/db";

const logUnplannedWorkout = new LogUnplannedWorkout(prisma);
const requestWorkout = new RequestWorkout(prisma);

// ---------------------------------------------------------------------------
// Adicionar atividade
// ---------------------------------------------------------------------------

export type LogUnplannedWorkoutState = { message?: string; fieldErrors?: Record<string, string> };

const logFormSchema = z.object({
  sportType: z.string().min(1, "Selecione a modalidade."),
  date: z.string().min(1, "Informe a data."),
  durationMinutes: z.string().optional(),
  distanceKm: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export async function logUnplannedWorkoutAction(
  _prev: LogUnplannedWorkoutState,
  formData: FormData,
): Promise<LogUnplannedWorkoutState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = logFormSchema.safeParse({
    sportType: formData.get("sportType"),
    date: formData.get("date"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    distanceKm: formData.get("distanceKm") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    return { fieldErrors };
  }
  if (!parsed.data.durationMinutes && !parsed.data.distanceKm) {
    return { fieldErrors: { durationMinutes: "Informe duração ou distância." } };
  }

  const durationSeconds = parsed.data.durationMinutes ? Math.round(Number(parsed.data.durationMinutes) * 60) : null;
  const distanceMeters = parsed.data.distanceKm ? Math.round(Number(parsed.data.distanceKm) * 1000) : null;
  const isoDate = parsed.data.date;

  try {
    await logUnplannedWorkout.execute(session.user.id, {
      sportType: parsed.data.sportType,
      // Noon UTC avoids the date rolling over to the previous/next day depending on timezone.
      scheduledAt: new Date(`${isoDate}T12:00:00.000Z`),
      durationSeconds,
      distanceMeters,
      note: parsed.data.note || null,
    });
  } catch (error) {
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível registrar a atividade agora. Tente novamente." };
  }

  redirect(`/app/treinos?view=day&date=${isoDate}`);
}

// ---------------------------------------------------------------------------
// Solicitar treino ao professor
// ---------------------------------------------------------------------------

export type RequestWorkoutState = { message?: string; fieldErrors?: Record<string, string> };

const requestFormSchema = z.object({
  schoolId: z.string().min(1, "Selecione a escola."),
  sportType: z.string().min(1, "Selecione a modalidade."),
  preferredDate: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export async function requestWorkoutAction(
  _prev: RequestWorkoutState,
  formData: FormData,
): Promise<RequestWorkoutState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = requestFormSchema.safeParse({
    schoolId: formData.get("schoolId"),
    sportType: formData.get("sportType"),
    preferredDate: formData.get("preferredDate") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    return { fieldErrors };
  }

  try {
    await requestWorkout.execute(session.user.id, {
      schoolId: parsed.data.schoolId,
      sportType: parsed.data.sportType,
      preferredDate: parsed.data.preferredDate ? new Date(`${parsed.data.preferredDate}T12:00:00.000Z`) : null,
      note: parsed.data.note || null,
    });
  } catch (error) {
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível enviar o pedido agora. Tente novamente." };
  }

  redirect("/app/treinos?view=list&requested=1");
}
