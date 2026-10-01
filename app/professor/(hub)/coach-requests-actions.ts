"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { DecideCoachAssignmentRequest } from "@/modules/school/application/decide-coach-assignment-request";
import { EndCoachAssignmentAsCoach } from "@/modules/school/application/end-coach-assignment-as-coach";

/**
 * SAM-26 — the coach's side of an athlete's request to be followed, and the
 * independent coach's way out of a link. Authorization lives in the use cases
 * (session coach only); these actions just forward intent and revalidate the
 * screens that list the request and the roster.
 */
const decide = new DecideCoachAssignmentRequest(prisma);
const endAsCoach = new EndCoachAssignmentAsCoach(prisma);

export type CoachRequestActionState = { message?: string; ok?: boolean };

const schema = z.object({
  assignmentId: z.string().min(1),
  schoolId: z.string().min(1).optional(),
});

function toState(error: unknown): CoachRequestActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

function revalidateCoachSurfaces(schoolId?: string) {
  revalidatePath("/professor");
  revalidatePath("/professor/independente");
  if (schoolId) {
    revalidatePath(`/professor/${schoolId}`);
    revalidatePath(`/professor/${schoolId}/atletas`);
  }
}

function decisionAction(decision: "accept" | "reject") {
  return async function action(_prev: CoachRequestActionState, formData: FormData): Promise<CoachRequestActionState> {
    if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
    const session = await requireOnboardedSession();
    const parsed = schema.safeParse({
      assignmentId: formData.get("assignmentId"),
      schoolId: formData.get("schoolId") || undefined,
    });
    if (!parsed.success) return toState(parsed.error);

    try {
      await decide.execute(session.user.id, parsed.data.assignmentId, decision);
    } catch (error) {
      return toState(error);
    }

    revalidateCoachSurfaces(parsed.data.schoolId);
    return { ok: true };
  };
}

export const acceptCoachRequestAction = decisionAction("accept");
export const rejectCoachRequestAction = decisionAction("reject");

export async function endIndependentCoachingAction(
  _prev: CoachRequestActionState,
  formData: FormData,
): Promise<CoachRequestActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();
  const parsed = schema.safeParse({ assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return toState(parsed.error);

  try {
    await endAsCoach.execute(session.user.id, parsed.data.assignmentId);
  } catch (error) {
    return toState(error);
  }

  revalidateCoachSurfaces();
  return { ok: true };
}
