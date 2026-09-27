/**
 * Turmas do professor (teams view from the coach perspective).
 *
 * Shows only teams this coach is explicitly assigned to, and for each one the
 * facts that decide the next session: modality, level, where it meets, how full
 * it is, and when the team last received a prescription.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { getRyvanoSportLabel, isRyvanoSportType } from "@/modules/shared/activities/sport-types";
import { StatTiles } from "@/components/stat-tiles";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

function sportLabel(sportType: string | null): string {
  if (!sportType) return "Modalidade a definir";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

export default async function TurmasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const teams = await prisma.team.findMany({
    where: { schoolId, archivedAt: null, coaches: { some: { coachId: coachProfile.id } } },
    include: {
      _count: { select: { members: true, coaches: true } },
    },
    orderBy: { name: "asc" },
  });

  const teamIds = teams.map((team) => team.id);
  const lastAssignments = teamIds.length
    ? await prisma.workoutAssignment.groupBy({
        by: ["teamId"],
        where: { teamId: { in: teamIds } },
        _max: { scheduledAt: true, createdAt: true },
      })
    : [];

  const lastByTeam = new Map(
    lastAssignments
      .filter((row): row is typeof row & { teamId: string } => row.teamId !== null)
      .map((row) => {
        const scheduled = row._max.scheduledAt;
        const created = row._max.createdAt;
        const latest =
          scheduled && created ? (scheduled > created ? scheduled : created) : scheduled ?? created;
        return [row.teamId, latest];
      }),
  );

  const totalAthletes = teams.reduce((total, team) => total + team._count.members, 0);
  // A team over its declared capacity is a legitimate state (capacity is a
  // declaration, not a constraint), but the coach should still see it.
  const overCapacity = teams.filter(
    (team) => team.capacity !== null && team._count.members > team.capacity,
  ).length;

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-xl font-semibold">Minhas turmas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Turmas em que você foi designado como professor nesta escola.
        </p>
      </div>

      <StatTiles
        items={[
          { label: "Turmas", value: teams.length },
          { label: "Atletas somados", value: totalAthletes },
          {
            label: "Acima da capacidade",
            value: overCapacity,
            tone: overCapacity > 0 ? "warning" : "neutral",
            hint: overCapacity > 0 ? "revisar com a administração" : undefined,
          },
        ]}
      />

      {teams.length === 0 ? (
        <EmptyState
          title="Nenhuma turma atribuída"
          description="Quando a administração da escola designar você como professor de uma turma, ela aparece aqui."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const lastAt = lastByTeam.get(team.id) ?? null;
            const full = team.capacity !== null && team._count.members >= team.capacity;
            return (
              <li key={team.id} className="glass space-y-3 rounded-[20px] p-5">
                <div>
                  <p className="font-medium leading-tight">{team.name}</p>
                  <p className="text-xs text-foreground/50">{sportLabel(team.sportType)}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {team.level && <StatusBadge tone="neutral">{team.level}</StatusBadge>}
                  <StatusBadge tone={full ? "warning" : "neutral"}>
                    {team.capacity !== null
                      ? `${team._count.members}/${team.capacity} atletas`
                      : `${team._count.members} atleta${team._count.members !== 1 ? "s" : ""}`}
                  </StatusBadge>
                  {team._count.coaches > 1 && (
                    <StatusBadge tone="neutral">{`+${team._count.coaches - 1} professor(es)`}</StatusBadge>
                  )}
                </div>

                {team.location && (
                  <p className="text-xs text-foreground/55">📍 {team.location}</p>
                )}

                <p className="text-xs text-foreground/45">
                  {lastAt
                    ? `Último treino da turma em ${new Date(lastAt).toLocaleDateString("pt-BR")}`
                    : "Nenhum treino prescrito para a turma"}
                </p>

                {team.notes && (
                  <p className="border-t border-white/8 pt-2 text-xs leading-relaxed text-foreground/60">
                    {team.notes}
                  </p>
                )}

                <Link
                  href={`/professor/${schoolId}/treinos`}
                  className="inline-block text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                >
                  Prescrever para a turma →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
