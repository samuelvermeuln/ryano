"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { BulkAssignCoach } from "@/modules/school/application/bulk-assign-coach";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { EndCoachAssignment } from "@/modules/school/application/end-coach-assignment";
import { RemoveAthleteFromSchool } from "@/modules/school/application/remove-athlete-from-school";

const assignCoach = new AssignCoachToAthlete(prisma);
const bulkAssign = new BulkAssignCoach(prisma);
const changeCoach = new ChangeAthleteCoach(prisma);
const endAssignment = new EndCoachAssignment(prisma);
const removeAthlete = new RemoveAthleteFromSchool(prisma);

export type AthleteActionState = { message?: string; ok?: boolean };

const idSchema = z.string().min(1);

/**
 * Domain failures come back as state rather than thrown errors so the table
 * keeps rendering with the message next to the row that failed, instead of
 * the whole screen being replaced by an error boundary.
 */
function toState(error: unknown): AthleteActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

function revalidateAthletes(schoolId: string) {
  revalidatePath(`/escola/${schoolId}/atletas`);
  revalidatePath(`/escola/${schoolId}/organograma`);
}

const assignSchema = z.object({
  schoolId: idSchema,
  athleteId: idSchema,
  coachId: idSchema.min(1, "Selecione um professor."),
});

export async function assignCoachAction(
  _prev: AthleteActionState,
  formData: FormData,
): Promise<AthleteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = assignSchema.safeParse({
    schoolId: formData.get("schoolId"),
    athleteId: formData.get("athleteId"),
    coachId: formData.get("coachId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await assignCoach.execute(session.user.id, parsed.data.schoolId, parsed.data.athleteId, parsed.data.coachId);
  } catch (error) {
    return toState(error);
  }

  revalidateAthletes(parsed.data.schoolId);
  return { ok: true };
}

const changeSchema = assignSchema.extend({
  reason: z.string().trim().max(500).optional(),
});

export async function changeCoachAction(
  _prev: AthleteActionState,
  formData: FormData,
): Promise<AthleteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = changeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    athleteId: formData.get("athleteId"),
    coachId: formData.get("coachId"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await changeCoach.execute(
      session.user.id,
      parsed.data.schoolId,
      parsed.data.athleteId,
      parsed.data.coachId,
      parsed.data.reason?.length ? parsed.data.reason : null,
    );
  } catch (error) {
    return toState(error);
  }

  revalidateAthletes(parsed.data.schoolId);
  return { ok: true };
}

const bulkSchema = z.object({
  schoolId: idSchema,
  coachId: idSchema.min(1, "Selecione um professor."),
  athleteIds: z.array(idSchema).min(1, "Selecione ao menos um atleta."),
});

export async function bulkAssignCoachAction(
  _prev: AthleteActionState,
  formData: FormData,
): Promise<AthleteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = bulkSchema.safeParse({
    schoolId: formData.get("schoolId"),
    coachId: formData.get("coachId"),
    athleteIds: formData.getAll("athleteIds"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await bulkAssign.execute(session.user.id, parsed.data.schoolId, {
      coachId: parsed.data.coachId,
      athleteIds: parsed.data.athleteIds,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateAthletes(parsed.data.schoolId);
  return { ok: true };
}

const endSchema = z.object({ schoolId: idSchema, assignmentId: idSchema });

export async function endAssignmentAction(
  _prev: AthleteActionState,
  formData: FormData,
): Promise<AthleteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = endSchema.safeParse({
    schoolId: formData.get("schoolId"),
    assignmentId: formData.get("assignmentId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await endAssignment.execute(session.user.id, parsed.data.schoolId, parsed.data.assignmentId);
  } catch (error) {
    return toState(error);
  }

  revalidateAthletes(parsed.data.schoolId);
  return { ok: true };
}

const removeSchema = z.object({ schoolId: idSchema, membershipId: idSchema });

export async function removeAthleteAction(
  _prev: AthleteActionState,
  formData: FormData,
): Promise<AthleteActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = removeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await removeAthlete.execute(session.user.id, parsed.data.schoolId, parsed.data.membershipId);
  } catch (error) {
    return toState(error);
  }

  revalidateAthletes(parsed.data.schoolId);
  return { ok: true };
}
