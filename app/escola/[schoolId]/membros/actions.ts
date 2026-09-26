"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { SchoolRole } from "@/modules/school/domain/enums";
import { AddSchoolMember } from "@/modules/school/application/add-school-member";
import { RemoveSchoolMember } from "@/modules/school/application/remove-school-member";
import { AddRoleToMember } from "@/modules/school/application/add-role-to-member";
import { RemoveRoleFromMember } from "@/modules/school/application/remove-role-from-member";

const addMember = new AddSchoolMember(prisma);
const removeMember = new RemoveSchoolMember(prisma);
const addRole = new AddRoleToMember(prisma);
const removeRole = new RemoveRoleFromMember(prisma);

export type MemberActionState = { message?: string; ok?: boolean };

const idSchema = z.string().min(1);
const addMemberFormSchema = z.object({
  schoolId: idSchema,
  email: z.string().trim().min(1, "Informe o e-mail."),
  roles: z.array(z.enum(SchoolRole)).min(1, "Selecione ao menos um papel."),
});
const roleFormSchema = z.object({
  schoolId: idSchema,
  membershipId: idSchema,
  role: z.enum(SchoolRole),
});

/**
 * Failures come back as state instead of thrown errors so the screen can show
 * the domain message ("Usuário não encontrado.") next to the form, rather than
 * replacing the whole page with an error boundary.
 */
function toState(error: unknown): MemberActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) {
    return { message: error.issues[0]?.message ?? "Dados inválidos." };
  }
  return { message: "Não foi possível concluir a operação. Tente novamente." };
}

function revalidateMembers(schoolId: string, membershipId?: string) {
  revalidatePath(`/escola/${schoolId}/membros`);
  if (membershipId) revalidatePath(`/escola/${schoolId}/membros/${membershipId}`);
}

export async function addMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = addMemberFormSchema.safeParse({
    schoolId: formData.get("schoolId"),
    email: formData.get("email"),
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await addMember.execute(session.user.id, parsed.data.schoolId, {
      email: parsed.data.email,
      roles: parsed.data.roles,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateMembers(parsed.data.schoolId);
  return { ok: true };
}

export async function deactivateMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = z.object({ schoolId: idSchema, membershipId: idSchema }).safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await removeMember.execute(session.user.id, parsed.data.schoolId, parsed.data.membershipId);
  } catch (error) {
    return toState(error);
  }

  revalidateMembers(parsed.data.schoolId, parsed.data.membershipId);
  return { ok: true };
}

export async function addRoleAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = roleFormSchema.safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await addRole.execute(session.user.id, parsed.data.schoolId, parsed.data.membershipId, {
      role: parsed.data.role,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateMembers(parsed.data.schoolId, parsed.data.membershipId);
  return { ok: true };
}

export async function removeRoleAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = roleFormSchema.safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return toState(parsed.error);

  try {
    await removeRole.execute(session.user.id, parsed.data.schoolId, parsed.data.membershipId, {
      role: parsed.data.role,
    });
  } catch (error) {
    return toState(error);
  }

  revalidateMembers(parsed.data.schoolId, parsed.data.membershipId);
  return { ok: true };
}
