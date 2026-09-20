"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolService } from "@/modules/school/application/school-service";
import { SchoolError } from "@/modules/school/domain/errors";
import { prisma } from "@/server/db";

export type CreateSchoolState = {
  success?: boolean;
  message?: string;
};

const formSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(200),
  description: z.string().trim().max(5000).optional(),
  joinPolicy: z.enum(["AUTO_APPROVE", "REQUIRE_APPROVAL", "INVITE_ONLY"]).optional(),
});

const service = new SchoolService(prisma);

export async function createSchoolAction(
  _prev: CreateSchoolState,
  formData: FormData,
): Promise<CreateSchoolState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };

  const session = await requireOnboardedSession();

  const parsed = formSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    joinPolicy: formData.get("joinPolicy") || undefined,
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  let schoolId: string;
  try {
    const school = await service.create(session.user.id, parsed.data);
    schoolId = school.id;
  } catch (error) {
    if (error instanceof SchoolError) {
      return { message: error.message };
    }
    return { message: "Não foi possível criar a escola agora. Tente novamente." };
  }

  redirect(`/escola/${schoolId}`);
}
