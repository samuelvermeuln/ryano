"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  AddAthleteToTeam,
  AddCoachToTeam,
  ArchiveTeam,
  CreateTeam,
  RemoveAthleteFromTeam,
  RemoveCoachFromTeam,
} from "@/modules/school/application/manage-team";
import { UpdateTeam } from "@/modules/school/application/list-teams";

const createTeam = new CreateTeam(prisma);
const updateTeam = new UpdateTeam(prisma);
const archiveTeam = new ArchiveTeam(prisma);
const addAthlete = new AddAthleteToTeam(prisma);
const removeAthlete = new RemoveAthleteFromTeam(prisma);
const addCoach = new AddCoachToTeam(prisma);
const removeCoach = new RemoveCoachFromTeam(prisma);

export type TeamActionState = { message?: string; ok?: boolean };

const idSchema = z.string().min(1);

function toState(error: unknown): TeamActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Dados inválidos." };
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

function revalidateTeams(schoolId: string, teamId?: string) {
  revalidatePath(`/escola/${schoolId}/turmas`);
  if (teamId) revalidatePath(`/escola/${schoolId}/turmas/${teamId}`);
}

/**
 * An empty text input arrives as `""`. Sending that through would fail the
 * `min(1)` domain rule, so it is normalised to "no value": `undefined` on
 * create (leave unset) and `null` on update (explicitly clear).
 */
function optionalText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function optionalCapacity(value: FormDataEntryValue | null): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

const createSchema = z.object({
  schoolId: idSchema,
  name: z.string().trim().min(1, "Informe o nome da turma."),
  sportType: z.string().nullable(),
  level: z.string().nullable(),
  capacity: z.number().int().positive("A capacidade deve ser maior que zero.").nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
});

export async function createTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = createSchema.safeParse({
    schoolId: formData.get("schoolId"),
    name: formData.get("name"),
    sportType: optionalText(formData.get("sportType")),
    level: optionalText(formData.get("level")),
    capacity: optionalCapacity(formData.get("capacity")),
    location: optionalText(formData.get("location")),
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return toState(parsed.error);

  const { schoolId, ...fields } = parsed.data;
  try {
    await createTeam.execute(session.user.id, { schoolId, ...fields });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(schoolId);
  return { ok: true };
}

const updateSchema = createSchema.extend({ teamId: idSchema });

export async function updateTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = updateSchema.safeParse({
    schoolId: formData.get("schoolId"),
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    sportType: optionalText(formData.get("sportType")),
    level: optionalText(formData.get("level")),
    capacity: optionalCapacity(formData.get("capacity")),
    location: optionalText(formData.get("location")),
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return toState(parsed.error);

  const { schoolId, teamId, ...fields } = parsed.data;
  try {
    // The form always submits every field, so a cleared input must reach the
    // use case as an explicit null ("limpar"), never be dropped as "não mexer".
    await updateTeam.execute(session.user.id, { teamId, ...fields });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(schoolId, teamId);
  return { ok: true };
}

const teamSchema = z.object({ schoolId: idSchema, teamId: idSchema });

export async function archiveTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = teamSchema.safeParse({
    schoolId: formData.get("schoolId"),
    teamId: formData.get("teamId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await archiveTeam.execute(session.user.id, { teamId: parsed.data.teamId });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(parsed.data.schoolId, parsed.data.teamId);
  return { ok: true };
}

const teamAthleteSchema = teamSchema.extend({ athleteId: idSchema.min(1, "Selecione um atleta.") });

export async function addAthleteToTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = teamAthleteSchema.safeParse({
    schoolId: formData.get("schoolId"),
    teamId: formData.get("teamId"),
    athleteId: formData.get("athleteId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await addAthlete.execute(session.user.id, { teamId: parsed.data.teamId, athleteId: parsed.data.athleteId });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(parsed.data.schoolId, parsed.data.teamId);
  return { ok: true };
}

export async function removeAthleteFromTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = teamAthleteSchema.safeParse({
    schoolId: formData.get("schoolId"),
    teamId: formData.get("teamId"),
    athleteId: formData.get("athleteId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await removeAthlete.execute(session.user.id, { teamId: parsed.data.teamId, athleteId: parsed.data.athleteId });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(parsed.data.schoolId, parsed.data.teamId);
  return { ok: true };
}

const teamCoachSchema = teamSchema.extend({ coachId: idSchema.min(1, "Selecione um professor.") });

export async function addCoachToTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = teamCoachSchema.safeParse({
    schoolId: formData.get("schoolId"),
    teamId: formData.get("teamId"),
    coachId: formData.get("coachId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await addCoach.execute(session.user.id, { teamId: parsed.data.teamId, coachId: parsed.data.coachId });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(parsed.data.schoolId, parsed.data.teamId);
  return { ok: true };
}

export async function removeCoachFromTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = teamCoachSchema.safeParse({
    schoolId: formData.get("schoolId"),
    teamId: formData.get("teamId"),
    coachId: formData.get("coachId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await removeCoach.execute(session.user.id, { teamId: parsed.data.teamId, coachId: parsed.data.coachId });
  } catch (error) {
    return toState(error);
  }

  revalidateTeams(parsed.data.schoolId, parsed.data.teamId);
  return { ok: true };
}
