"use server";

/**
 * SAM-16 — reschedule from the agenda. Thin adapter: parse the form, delegate
 * to `RescheduleWorkout` (which checks that the actor is the responsible coach
 * and records the history row), revalidate the agenda.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { RescheduleWorkout } from "@/modules/school/application/reschedule-workout";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

const rescheduleWorkout = new RescheduleWorkout(prisma);

export type AgendaActionState = { message?: string; success?: boolean };

const schema = z.object({
  schoolId: z.string().min(1),
  assignmentId: z.string().min(1),
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e horário."),
  reason: z.string().trim().max(2000).optional(),
});

export async function rescheduleFromAgendaAction(
  _prev: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = schema.safeParse({
    schoolId: formData.get("schoolId"),
    assignmentId: formData.get("assignmentId"),
    scheduledAt: formData.get("scheduledAt"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await rescheduleWorkout.execute(session.user.id, {
      assignmentId: parsed.data.assignmentId,
      // `datetime-local` value; the use case reads it in the school's zone.
      scheduledAtLocal: parsed.data.scheduledAt,
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível reagendar agora. Tente novamente." };
  }

  revalidatePath(`/professor/${parsed.data.schoolId}/agenda`);
  return { success: true };
}
