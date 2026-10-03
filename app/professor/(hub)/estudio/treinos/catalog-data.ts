/** SAM-58 — server data shared by the catalog pages: modality/environment options, the coach's schools and athletes. */
import { sportOptions } from "@/components/events/sport-options";
import { SPORT_ENVIRONMENT_LABELS, SPORT_ENVIRONMENTS } from "@/modules/school/domain/athlete-sport-level";
import { prisma } from "@/server/db";

export function environmentOptions() {
  return SPORT_ENVIRONMENTS.map((value) => ({ value, label: SPORT_ENVIRONMENT_LABELS[value] }));
}

export { sportOptions };

/** Schools where the actor manages the institutional catalog (OWNER/ADMIN). */
export async function managedSchools(userId: string) {
  const rows = await prisma.schoolMembership.findMany({
    where: { userId, status: "ACTIVE", endedAt: null, roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
    select: { school: { select: { id: true, name: true } } },
  });
  return rows.map((row) => ({ value: row.school.id, label: row.school.name }));
}

/** The coach's active athletes, with the prescribe URL of each scope (school or independent). */
export async function coachAthletes(userId: string) {
  const rows = await prisma.coachAthleteAssignment.findMany({
    where: { status: "ACTIVE", endedAt: null, coach: { userId, status: "ACTIVE" } },
    select: { athleteId: true, schoolId: true, athlete: { select: { name: true, email: true } }, school: { select: { name: true } } },
  });
  return rows.map((row) => ({
    athleteId: row.athleteId,
    schoolId: row.schoolId,
    label: `${row.athlete.name ?? row.athlete.email ?? "Atleta"}${row.school ? ` · ${row.school.name}` : " · independente"}`,
    prescribePath: row.schoolId ? `/professor/${row.schoolId}/atletas/${row.athleteId}/treinos/novo` : `/professor/independente/atletas/${row.athleteId}/treinos/novo`,
  }));
}
