/**
 * T256 — Tela atletas
 * T257 — Lobby: atletas sem professor atribuído
 *
 * Roster with the three things a school actually acts on: who has no
 * professor, who stopped training, and who is over/under-loaded. Every number
 * shown is aggregate; no individual buyer/payment data appears here.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { AthletesPanel, type AthleteRow, type CoachOption } from "./athletes-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

/** An athlete with no recorded activity in two weeks is the one to call. */
const IDLE_DAYS = 14;

function isIdle(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return true;
  return Date.now() - new Date(lastActivityAt).getTime() > IDLE_DAYS * 86_400_000;
}

/** Monday 00:00 local — the week boundary the rest of the product uses. */
function startOfWeek(now: Date): Date {
  const date = new Date(now);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function AtletasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const memberships = await prisma.schoolAthleteMembership.findMany({
    where: { schoolId },
    include: { athlete: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  const athleteIds = memberships.map((m) => m.athleteId);
  const weekStart = startOfWeek(new Date());

  const [assignments, coachMemberships, teamAthletes, weekWorkouts, lastActivities] = await Promise.all([
    prisma.coachAthleteAssignment.findMany({
      where: { schoolId, athleteId: { in: athleteIds }, endedAt: null },
      include: { coach: { select: { id: true, user: { select: { name: true } } } } },
    }),
    prisma.coachSchoolMembership.findMany({
      where: { schoolId, status: "ACTIVE", endedAt: null },
      include: { coach: { select: { id: true, user: { select: { name: true } } } } },
    }),
    // TeamAthlete has no end date — leaving a team deletes the row — so every
    // row found here is a current membership.
    prisma.teamAthlete.findMany({
      where: { athleteId: { in: athleteIds }, team: { schoolId } },
      select: { athleteId: true, team: { select: { name: true } } },
    }),
    prisma.workoutAssignment.groupBy({
      by: ["athleteId", "status"],
      where: { schoolId, athleteId: { in: athleteIds }, scheduledAt: { gte: weekStart } },
      _count: { _all: true },
    }),
    // One row per athlete would need a correlated subquery per athlete; the
    // grouped max is a single scan and is all the column needs.
    prisma.activity.groupBy({
      by: ["userId"],
      where: { userId: { in: athleteIds } },
      _max: { startedAt: true },
    }),
  ]);

  const assignmentByAthlete = new Map(assignments.map((a) => [a.athleteId, a]));
  const teamsByAthlete = new Map<string, string[]>();
  for (const entry of teamAthletes) {
    const current = teamsByAthlete.get(entry.athleteId) ?? [];
    current.push(entry.team.name);
    teamsByAthlete.set(entry.athleteId, current);
  }
  const lastActivityByAthlete = new Map(lastActivities.map((a) => [a.userId, a._max.startedAt]));

  const COMPLETED_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);
  const plannedByAthlete = new Map<string, number>();
  const completedByAthlete = new Map<string, number>();
  for (const row of weekWorkouts) {
    // CANCELLED work was never owed, so counting it would understate adherence.
    if (row.status === "CANCELLED") continue;
    plannedByAthlete.set(row.athleteId, (plannedByAthlete.get(row.athleteId) ?? 0) + row._count._all);
    if (COMPLETED_STATUSES.has(row.status)) {
      completedByAthlete.set(row.athleteId, (completedByAthlete.get(row.athleteId) ?? 0) + row._count._all);
    }
  }

  const athleteCountByCoach = new Map<string, number>();
  for (const assignment of assignments) {
    athleteCountByCoach.set(assignment.coachId, (athleteCountByCoach.get(assignment.coachId) ?? 0) + 1);
  }

  const rows: AthleteRow[] = memberships.map((membership) => {
    const assignment = assignmentByAthlete.get(membership.athleteId);
    return {
      membershipId: membership.id,
      athleteId: membership.athleteId,
      name: membership.athlete.name ?? membership.athlete.email ?? "Sem nome",
      email: membership.athlete.email,
      status: membership.status,
      since: (membership.startedAt ?? membership.createdAt).toISOString(),
      coach: assignment
        ? {
            assignmentId: assignment.id,
            coachId: assignment.coachId,
            name: assignment.coach.user.name ?? "Professor",
          }
        : null,
      teams: teamsByAthlete.get(membership.athleteId) ?? [],
      lastActivityAt: lastActivityByAthlete.get(membership.athleteId)?.toISOString() ?? null,
      plannedThisWeek: plannedByAthlete.get(membership.athleteId) ?? 0,
      completedThisWeek: completedByAthlete.get(membership.athleteId) ?? 0,
    };
  });

  const coaches: CoachOption[] = coachMemberships
    .map((membership) => ({
      coachId: membership.coachId,
      name: membership.coach.user.name ?? "Professor",
      suspended: membership.suspendedAt !== null,
      athleteCount: athleteCountByCoach.get(membership.coachId) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const active = rows.filter((row) => row.status === "ACTIVE");
  const lobby = active.filter((row) => !row.coach);
  const idle = active.filter((row) => isIdle(row.lastActivityAt));
  const totalPlanned = active.reduce((sum, row) => sum + row.plannedThisWeek, 0);
  const totalCompleted = active.reduce((sum, row) => sum + row.completedThisWeek, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Atletas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Atribua professores, acompanhe a adesão da semana e identifique quem parou de treinar.
        </p>
      </div>

      <StatTiles
        items={[
          { label: "Ativos", value: active.length },
          {
            label: "Sem professor",
            value: lobby.length,
            tone: lobby.length > 0 ? "warning" : "neutral",
            hint: lobby.length > 0 ? "Aguardando atribuição" : "Todos atribuídos",
          },
          {
            label: "Sem treino 14d",
            value: idle.length,
            tone: idle.length > 0 ? "warning" : "success",
            hint: "Sem atividade registrada",
          },
          {
            label: "Adesão da semana",
            value: totalPlanned === 0 ? "—" : `${Math.round((totalCompleted / totalPlanned) * 100)}%`,
            hint: totalPlanned === 0 ? "Nada prescrito" : `${totalCompleted} de ${totalPlanned} treinos`,
          },
        ]}
      />

      <SectionCard
        title={`Roster (${rows.length})`}
        description="Selecione atletas sem professor para atribuir em lote, ou use Gerenciar para agir em um atleta."
      >
        <AthletesPanel schoolId={schoolId} athletes={rows} coaches={coaches} />
      </SectionCard>
    </div>
  );
}
