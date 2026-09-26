"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { InvitationType, WorkoutChangeRequestStatus } from "@/modules/school/domain/enums";
import { CreateInvitationLink } from "@/modules/school/application/create-invitation-link";
import { RemoveCoachFromSchool } from "@/modules/school/application/remove-coach-from-school";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { RequestWorkoutChange } from "@/modules/school/application/request-workout-change";
import { DecideWorkoutChange } from "@/modules/school/application/decide-workout-change";

const createInvite = new CreateInvitationLink(prisma);
const removeCoach = new RemoveCoachFromSchool(prisma);
const changeCoach = new ChangeAthleteCoach(prisma);
const assignCoach = new AssignCoachToAthlete(prisma);
const requestChange = new RequestWorkoutChange(prisma);
const decideChange = new DecideWorkoutChange(prisma);

export type CoachActionState = { message?: string; ok?: boolean; inviteToken?: string };

const idSchema = z.string().min(1);

function toState(error: unknown): CoachActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

function revalidateCoaches(schoolId: string, membershipId?: string) {
  revalidatePath(`/escola/${schoolId}/professores`);
  if (membershipId) revalidatePath(`/escola/${schoolId}/professores/${membershipId}`);
}

/**
 * Invites a professor by generating a SCHOOL_COACH link.
 *
 * The school cannot create the coach's account for them, so "convidar" produces
 * a single-use link the administrator sends over.
 *
 * The raw token is returned once, here, and never again: only its hash is
 * stored, and /entrar/convite/[token] resolves by that hash. An administrator
 * who loses this link has to issue a new invite.
 */
export async function inviteCoachAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = z.object({
    schoolId: idSchema,
    expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
    requiresApproval: z.coerce.boolean().default(true),
  }).safeParse({
    schoolId: formData.get("schoolId"),
    expiresInDays: formData.get("expiresInDays") ?? undefined,
    requiresApproval: formData.get("requiresApproval") === "on",
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    const { token } = await createInvite.execute(session.user.id, {
      type: InvitationType.SCHOOL_COACH,
      schoolId: parsed.data.schoolId,
      requiresApproval: parsed.data.requiresApproval,
      expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000),
      maxUses: 1,
    });
    revalidatePath(`/escola/${parsed.data.schoolId}/convites`);
    revalidateCoaches(parsed.data.schoolId);
    return { ok: true, inviteToken: token };
  } catch (error) {
    return toState(error);
  }
}

export async function deactivateCoachAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = z.object({ schoolId: idSchema, membershipId: idSchema }).safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await removeCoach.execute(session.user.id, parsed.data.schoolId, parsed.data.membershipId);
  } catch (error) {
    return toState(error);
  }

  revalidateCoaches(parsed.data.schoolId, parsed.data.membershipId);
  return { ok: true };
}

/**
 * Sends an athlete to a professor, or moves them from another one.
 *
 * Which of the two it is is decided by the data, not by the caller: the UI
 * offers one "encaminhar" control and this picks the transfer path when the
 * athlete already has a primary coach, because ChangeAthleteCoach is the only
 * path that closes the previous period instead of leaving two open.
 */
export async function assignAthleteToCoachAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = z.object({
    schoolId: idSchema,
    membershipId: idSchema,
    coachId: idSchema,
    athleteId: idSchema,
  }).safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
    coachId: formData.get("coachId"),
    athleteId: formData.get("athleteId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    const existing = await prisma.coachAthleteAssignment.findFirst({
      where: {
        schoolId: parsed.data.schoolId,
        athleteId: parsed.data.athleteId,
        status: "ACTIVE",
        isPrimary: true,
      },
      select: { coachId: true },
    });
    if (existing?.coachId === parsed.data.coachId) {
      return { message: "Este atleta já está com este professor." };
    }
    if (existing) {
      await changeCoach.execute(
        session.user.id, parsed.data.schoolId, parsed.data.athleteId, parsed.data.coachId,
      );
    } else {
      await assignCoach.execute(
        session.user.id, parsed.data.schoolId, parsed.data.athleteId, parsed.data.coachId,
      );
    }
  } catch (error) {
    return toState(error);
  }

  revalidateCoaches(parsed.data.schoolId, parsed.data.membershipId);
  revalidatePath(`/escola/${parsed.data.schoolId}/atletas`);
  return { ok: true };
}

export async function requestWorkoutChangeAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = z.object({
    schoolId: idSchema,
    membershipId: idSchema,
    workoutAssignmentId: idSchema,
    reason: z.string().trim().min(1, "Descreva a alteração desejada.").max(2000),
  }).safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
    workoutAssignmentId: formData.get("workoutAssignmentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await requestChange.execute(session.user.id, parsed.data.schoolId, {
      workoutAssignmentId: parsed.data.workoutAssignmentId,
      reason: parsed.data.reason,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateCoaches(parsed.data.schoolId, parsed.data.membershipId);
  return { ok: true };
}

export async function cancelWorkoutChangeAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = z.object({
    schoolId: idSchema,
    membershipId: idSchema,
    requestId: idSchema,
  }).safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await decideChange.execute(session.user.id, parsed.data.schoolId, parsed.data.requestId, {
      status: WorkoutChangeRequestStatus.CANCELLED,
      resolutionNote: null,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateCoaches(parsed.data.schoolId, parsed.data.membershipId);
  return { ok: true };
}
