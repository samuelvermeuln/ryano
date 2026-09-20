"use server";

import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { SchoolService } from "@/modules/school/application/school-service";

const schools = new SchoolService(prisma);

export async function adminDeactivateSchoolAction(schoolId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  try {
    await schools.deactivateByAdmin(admin.id, schoolId);
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido.";
    return { error: msg };
  }
}

export async function adminReactivateSchoolAction(schoolId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  // Reactivation uses the owner's path — find the owner and call as admin override directly
  try {
    const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { ownerUserId: true, status: true } });
    if (school.status === "ACTIVE") return {};
    // Use the owner's userId so CanDeactivateSchool / requireOwnedSchool is satisfied
    await schools.reactivate(school.ownerUserId, schoolId);
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido.";
    return { error: msg };
  }
}
