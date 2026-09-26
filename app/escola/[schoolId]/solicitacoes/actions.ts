"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { ApproveAthleteMembership } from "@/modules/school/application/approve-athlete-membership";
import { RejectAthleteMembership } from "@/modules/school/application/reject-athlete-membership";
import { ApproveCoachSchoolMembership } from "@/modules/school/application/approve-coach-school-membership";
import { RejectCoachSchoolMembership } from "@/modules/school/application/reject-coach-school-membership";

const approveAthlete = new ApproveAthleteMembership(prisma);
const rejectAthlete = new RejectAthleteMembership(prisma);
const approveCoach = new ApproveCoachSchoolMembership(prisma);
const rejectCoach = new RejectCoachSchoolMembership(prisma);

export type RequestActionState = { message?: string; ok?: boolean };

const schema = z.object({
  schoolId: z.string().min(1),
  membershipId: z.string().min(1),
});

function toState(error: unknown): RequestActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

/**
 * Approving/rejecting changes the roster and the pending counter shown in the
 * shell, so all three surfaces are revalidated. The previous version
 * revalidated only `/escola`, which left this very screen showing the request
 * it had just decided.
 */
function revalidateRequests(schoolId: string) {
  revalidatePath(`/escola/${schoolId}/solicitacoes`);
  revalidatePath(`/escola/${schoolId}/atletas`);
  revalidatePath(`/escola/${schoolId}/professores`);
  revalidatePath(`/escola/${schoolId}`);
}

/** The four decisions differ only in the use case they delegate to. */
function decisionAction(run: (actorId: string, schoolId: string, membershipId: string) => Promise<unknown>) {
  return async function action(
    _prev: RequestActionState,
    formData: FormData,
  ): Promise<RequestActionState> {
    if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
    const session = await requireOnboardedSession();

    const parsed = schema.safeParse({
      schoolId: formData.get("schoolId"),
      membershipId: formData.get("membershipId"),
    });
    if (!parsed.success) return toState(parsed.error);

    try {
      await run(session.user.id, parsed.data.schoolId, parsed.data.membershipId);
    } catch (error) {
      return toState(error);
    }

    revalidateRequests(parsed.data.schoolId);
    return { ok: true };
  };
}

export const approveAthleteAction = decisionAction((actorId, schoolId, membershipId) =>
  approveAthlete.execute(actorId, schoolId, membershipId),
);

export const rejectAthleteAction = decisionAction((actorId, schoolId, membershipId) =>
  rejectAthlete.execute(actorId, schoolId, membershipId),
);

export const approveCoachAction = decisionAction((actorId, schoolId, membershipId) =>
  approveCoach.execute(actorId, schoolId, membershipId),
);

export const rejectCoachAction = decisionAction((actorId, schoolId, membershipId) =>
  rejectCoach.execute(actorId, schoolId, membershipId),
);
