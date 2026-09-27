"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutChangeRequestStatus } from "@/modules/school/domain/enums";
import { DecideWorkoutChange } from "@/modules/school/application/decide-workout-change";

/**
 * The coach's side of a workout change request.
 *
 * The administration could already open these (and withdraw them), but the
 * professor they are addressed to had nowhere to answer — the request sat
 * PENDING forever with the only visible action belonging to the wrong party.
 *
 * Authorization is NOT re-implemented here: `DecideWorkoutChange` already
 * enforces that only the responsible coach may ACKNOWLEDGE/RESOLVE/DECLINE and
 * that CANCELLED is administration-only, so this action just forwards intent.
 */
const decideChange = new DecideWorkoutChange(prisma);

export type CoachActionState = { message?: string; ok?: boolean };

const decideSchema = z.object({
  schoolId: z.string().min(1),
  requestId: z.string().min(1),
  status: z.enum([
    WorkoutChangeRequestStatus.ACKNOWLEDGED,
    WorkoutChangeRequestStatus.RESOLVED,
    WorkoutChangeRequestStatus.DECLINED,
  ]),
  resolutionNote: z.string().trim().max(2000).optional(),
});

function toState(error: unknown): CoachActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

export async function decideWorkoutChangeAsCoachAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const rawNote = formData.get("resolutionNote");
  const parsed = decideSchema.safeParse({
    schoolId: formData.get("schoolId"),
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    resolutionNote: typeof rawNote === "string" && rawNote.trim().length > 0 ? rawNote : undefined,
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await decideChange.execute(session.user.id, parsed.data.schoolId, parsed.data.requestId, {
      status: parsed.data.status,
      resolutionNote: parsed.data.resolutionNote,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/professor/${parsed.data.schoolId}`);
  revalidatePath(`/professor/${parsed.data.schoolId}/treinos`);
  return { ok: true };
}
