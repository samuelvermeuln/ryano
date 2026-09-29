/**
 * T508 — Tela de turmas da escola (defeito D1).
 *
 * Lists active teams with the actions that make the screen usable on its own:
 * create, edit and archive inline; athlete/coach membership lives on the team
 * detail page.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { TeamsPanel, type TeamRow } from "./teams-panel";
import type { PersonOption } from "./participant-picker";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function TurmasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const [school, teams, archivedCount, schoolAthletes, schoolCoaches] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } }),
    prisma.team.findMany({
      where: { schoolId, archivedAt: null },
      select: {
        id: true, name: true, sportType: true, level: true, capacity: true, location: true, notes: true,
        coaches: { select: { coach: { select: { user: { select: { name: true } } } } } },
        _count: { select: { members: true, coaches: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.team.count({ where: { schoolId, archivedAt: { not: null } } }),
    // Candidates are scoped to this school here as well as in the use case:
    // filtering the list is usability, the use case is what enforces it.
    prisma.schoolAthleteMembership.findMany({
      where: { schoolId, status: "ACTIVE", endedAt: null },
      select: { athleteId: true, athlete: { select: { name: true, email: true } } },
    }),
    prisma.coachSchoolMembership.findMany({
      where: { schoolId, status: "ACTIVE", endedAt: null },
      select: { coachId: true, coach: { select: { user: { select: { name: true, email: true } } } } },
    }),
  ]);
  if (!school) notFound();

  const byName = (a: PersonOption, b: PersonOption) => a.name.localeCompare(b.name, "pt-BR");

  const athleteOptions: PersonOption[] = schoolAthletes
    .map((row) => ({
      id: row.athleteId,
      name: row.athlete?.name ?? row.athlete?.email ?? "Sem nome",
      email: row.athlete?.email ?? null,
    }))
    .sort(byName);

  const coachOptions: PersonOption[] = schoolCoaches
    .map((row) => ({
      id: row.coachId,
      name: row.coach?.user?.name ?? "Professor",
      email: row.coach?.user?.email ?? null,
    }))
    .sort(byName);

  const rows: TeamRow[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    sportType: team.sportType,
    level: team.level,
    location: team.location,
    notes: team.notes,
    capacity: team.capacity,
    athleteCount: team._count.members,
    coachCount: team._count.coaches,
    coachNames: team.coaches.map((entry) => entry.coach.user.name ?? "Professor"),
  }));

  const totalAthletes = rows.reduce((sum, team) => sum + team.athleteCount, 0);
  const withoutCoach = rows.filter((team) => team.coachCount === 0).length;
  const full = rows.filter((team) => team.capacity !== null && team.athleteCount >= team.capacity).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Turmas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Agrupe atletas e professores. Turmas arquivadas saem da lista sem perder histórico.
        </p>
      </div>

      <StatTiles
        items={[
          { label: "Turmas ativas", value: rows.length, hint: archivedCount > 0 ? `${archivedCount} arquivada(s)` : undefined },
          { label: "Atletas em turmas", value: totalAthletes },
          {
            label: "Sem professor",
            value: withoutCoach,
            tone: withoutCoach > 0 ? "warning" : "success",
          },
          {
            label: "Lotadas",
            value: full,
            tone: full > 0 ? "warning" : "neutral",
            hint: "Atingiram a capacidade declarada",
          },
        ]}
      />

      <SectionCard
        title={`Turmas ativas (${rows.length})`}
        description="Use Gerenciar para adicionar atletas e professores à turma."
      >
        <TeamsPanel
          schoolId={schoolId}
          teams={rows}
          athleteOptions={athleteOptions}
          coachOptions={coachOptions}
        />
      </SectionCard>
    </div>
  );
}
