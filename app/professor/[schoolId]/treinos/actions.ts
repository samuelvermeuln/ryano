"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { FulfillWorkoutRequest } from "@/modules/school/application/fulfill-workout-request";
import { DeclineWorkoutRequest } from "@/modules/school/application/decline-workout-request";
import { prisma } from "@/server/db";

const fulfillWorkoutRequest = new FulfillWorkoutRequest(prisma);
const declineWorkoutRequest = new DeclineWorkoutRequest(prisma);

export type FulfillWorkoutRequestState = { message?: string; fieldErrors?: Record<string, string> };

const fulfillFormSchema = z.object({
  requestId: z.string().min(1),
  schoolId: z.string().min(1),
  title: z.string().trim().min(1, "Informe um título.").max(200),
  scheduledAt: z.string().min(1, "Informe a data."),
  durationMinutes: z.string().optional(),
  distanceKm: z.string().optional(),
});

/** Coach approves a pending request, filling in the minimal workout details. */
export async function fulfillWorkoutRequestAction(
  _prev: FulfillWorkoutRequestState,
  formData: FormData,
): Promise<FulfillWorkoutRequestState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = fulfillFormSchema.safeParse({
    requestId: formData.get("requestId"),
    schoolId: formData.get("schoolId"),
    title: formData.get("title"),
    scheduledAt: formData.get("scheduledAt"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    distanceKm: formData.get("distanceKm") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    return { fieldErrors };
  }

  try {
    await fulfillWorkoutRequest.execute(session.user.id, {
      requestId: parsed.data.requestId,
      title: parsed.data.title,
      scheduledAt: new Date(parsed.data.scheduledAt),
      durationSeconds: parsed.data.durationMinutes ? Math.round(Number(parsed.data.durationMinutes) * 60) : null,
      distanceMeters: parsed.data.distanceKm ? Math.round(Number(parsed.data.distanceKm) * 1000) : null,
    });
  } catch (error) {
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível aprovar o pedido agora. Tente novamente." };
  }

  revalidatePath(`/professor/${parsed.data.schoolId}/treinos`);
  return {};
}

/** Coach declines a pending request — plain form action, no client state needed. */
export async function declineWorkoutRequestAction(formData: FormData) {
  if (!isSchoolModuleEnabled()) return;
  const session = await requireOnboardedSession();
  const requestId = formData.get("requestId") as string;
  const schoolId = formData.get("schoolId") as string;
  const declineReason = (formData.get("declineReason") as string) || undefined;

  await declineWorkoutRequest.execute(session.user.id, { requestId, declineReason });
  revalidatePath(`/professor/${schoolId}/treinos`);
}
