"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { createCoachProfile } from "@/modules/school/domain/coach-profile";
import { prisma } from "@/server/db";

export type CreateCoachProfileState = {
  message?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  displayName: z.string().trim().min(2, "Informe seu nome de professor (mínimo 2 caracteres).").max(200),
  bio: z.string().trim().max(2000).optional(),
});

export async function createCoachProfileAction(
  _prev: CreateCoachProfileState,
  formData: FormData,
): Promise<CreateCoachProfileState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };

  const session = await requireOnboardedSession();

  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    }
    return { fieldErrors };
  }

  // Idempotente — retorna sem erro se já existe
  const existing = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } });
  if (existing) return {};

  try {
    const now = new Date();
    const profile = createCoachProfile({ id: randomUUID(), userId: session.user.id, ...parsed.data }, now);
    await prisma.coachProfile.create({ data: profile });
    return {};
  } catch (error) {
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível criar o perfil agora. Tente novamente." };
  }
}
