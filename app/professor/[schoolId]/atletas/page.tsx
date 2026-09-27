/**
 * T271 — Lista "Meus atletas" (visão do professor).
 *
 * Each athlete carries the three things that decide whether the coach must act:
 * compliance, executions awaiting confirmation, and how long since the last
 * prescription. Filtering and sorting happen client-side over the roster the
 * server already loaded — a coach's roster is tens of athletes, not thousands,
 * so paginating would cost a round trip per keystroke for no benefit.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { StatTiles } from "@/components/stat-tiles";
import { EmptyState } from "@/components/empty-state";
import { RosterPanel, type RosterAthlete } from "./roster-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

const STALE_ATHLETE_DAYS = 14;

export default async function MeusAtletasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const assignments = await prisma.coachAthleteAssignment.findMany({
    where: { schoolId, coachId: coachProfile.id, endedAt: null },
    include: {
      athlete: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { startedAt: "asc" },
  });

  const athleteIds = assignments.map((assignment) => assignment.athleteId);

  const [complianceData, pendingData, lastPrescriptions, teamMemberships] = await Promise.all([
    athleteIds.length === 0 ? [] : prisma.workoutCompliance.groupBy({
      by: ["athleteId"],
      where: { athleteId: { in: athleteIds }, assignment: { schoolId } },
      _avg: { overallScore: true },
      _count: true,
    }),
    athleteIds.length === 0 ? [] : prisma.workoutExecution.groupBy({
      by: ["athleteId"],
      where: { athleteId: { in: athleteIds }, matchStatus: "AUTO_MATCHED", assignment: { schoolId } },
      _count: true,
    }),
    // Newest prescription per athlete. `groupBy` with `_max` keeps this to one
    // query instead of one per athlete.
    athleteIds.length === 0 ? [] : prisma.workoutAssignment.groupBy({
      by: ["athleteId"],
      where: { athleteId: { in: athleteIds }, schoolId, coachId: coachProfile.id },
      _max: { scheduledAt: true, createdAt: true },
    }),
    // TeamAthlete has no soft-delete column — leaving a team removes the row —
    // so an existing row is itself the current membership.
    athleteIds.length === 0 ? [] : prisma.teamAthlete.findMany({
      where: { athleteId: { in: athleteIds }, team: { schoolId, archivedAt: null } },
      select: { athleteId: true, team: { select: { name: true } } },
    }),
  ]);

  const complianceMap = new Map(
    complianceData.map((row) => [row.athleteId, { avg: row._avg.overallScore, count: row._count }]),
  );
  const pendingMap = new Map(pendingData.map((row) => [row.athleteId, row._count]));
  const lastPrescriptionMap = new Map(
    lastPrescriptions.map((row) => {
      // A prescription may be scheduled for a date or only created; the later of
      // the two is what "último treino" means to a coach.
      const scheduled = row._max.scheduledAt;
      const created = row._max.createdAt;
      const latest = scheduled && created ? (scheduled > created ? scheduled : created) : scheduled ?? created;
      return [row.athleteId, latest];
    }),
  );
  const teamsMap = new Map<string, string[]>();
  for (const membership of teamMemberships) {
    const names = teamsMap.get(membership.athleteId) ?? [];
    names.push(membership.team.name);
    teamsMap.set(membership.athleteId, names);
  }

  const today = new Date().getTime();
  const athletes: RosterAthlete[] = assignments.map(({ athlete }) => {
    const compliance = complianceMap.get(athlete.id);
    const lastAt = lastPrescriptionMap.get(athlete.id) ?? null;
    return {
      id: athlete.id,
      name: athlete.name ?? athlete.email ?? "Sem nome",
      email: athlete.email,
      image: athlete.image,
      complianceAvg: compliance?.avg ?? null,
      complianceCount: compliance?.count ?? 0,
      pendingExecutions: pendingMap.get(athlete.id) ?? 0,
      lastPrescriptionLabel: lastAt ? new Date(lastAt).toLocaleDateString("pt-BR") : null,
      daysSinceLastPrescription: lastAt
        ? Math.floor((today - new Date(lastAt).getTime()) / 86_400_000)
        : null,
      teamNames: teamsMap.get(athlete.id) ?? [],
    };
  });

  const needingAttention = athletes.filter(
    (athlete) =>
      athlete.pendingExecutions > 0 ||
      athlete.daysSinceLastPrescription === null ||
      athlete.daysSinceLastPrescription >= STALE_ATHLETE_DAYS,
  ).length;
  const scored = athletes.filter((athlete) => athlete.complianceAvg != null);
  const rosterAverage =
    scored.length === 0
      ? null
      : scored.reduce((total, athlete) => total + (athlete.complianceAvg ?? 0), 0) / scored.length;

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-xl font-semibold">Meus atletas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Atletas sob sua responsabilidade nesta escola.
        </p>
      </div>

      <StatTiles
        items={[
          { label: "Atletas", value: athletes.length },
          {
            label: "Precisam de atenção",
            value: needingAttention,
            tone: needingAttention > 0 ? "warning" : "success",
            hint: needingAttention === 0 ? "nada pendente" : "pendência ou treino atrasado",
          },
          {
            label: "Confirmações pendentes",
            value: athletes.reduce((total, athlete) => total + athlete.pendingExecutions, 0),
          },
          {
            label: "Compliance médio",
            value: rosterAverage != null ? `${(rosterAverage / 10).toFixed(1)}/10` : "—",
            hint: rosterAverage == null ? "sem avaliações" : `${scored.length} com nota`,
          },
        ]}
      />

      {athletes.length === 0 ? (
        <EmptyState
          title="Nenhum atleta atribuído"
          description="Quando a administração da escola vincular atletas a você, eles aparecem aqui com compliance, pendências e histórico."
        />
      ) : (
        <RosterPanel schoolId={schoolId} athletes={athletes} />
      )}
    </div>
  );
}
