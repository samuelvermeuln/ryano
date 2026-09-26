/**
 * T509 — Detalhe da turma: atletas, professores e ocupação.
 *
 * Implementada junto da T508 porque a listagem linka para cá, e o critério da
 * T508 exige que nenhum link aponte para rota inexistente.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { MembershipPanel, type PersonRow } from "./membership-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; teamId: string }> };

export default async function TurmaDetalhePage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId, teamId } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true, schoolId: true, name: true, sportType: true, level: true,
      capacity: true, location: true, notes: true, archivedAt: true,
      members: {
        select: { athleteId: true, createdAt: true, athlete: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      coaches: {
        select: { coachId: true, coach: { select: { user: { select: { name: true, email: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Turma de outra escola não pode ser aberta pela URL desta: sem esta checagem
  // a página viraria um caminho lateral para ler dados de outra escola.
  if (!team || team.schoolId !== schoolId) notFound();

  const occupancy = team.members.length;
  const full = team.capacity !== null && occupancy >= team.capacity;

  // Candidates are the school's active people minus whoever is already in the
  // team, so the dropdowns can never offer an option the use case would reject.
  const memberAthleteIds = new Set(team.members.map((m) => m.athleteId));
  const memberCoachIds = new Set(team.coaches.map((c) => c.coachId));

  const [schoolAthletes, schoolCoaches] = await Promise.all([
    prisma.schoolAthleteMembership.findMany({
      where: { schoolId, status: "ACTIVE", endedAt: null },
      select: { athleteId: true, athlete: { select: { name: true, email: true } } },
    }),
    prisma.coachSchoolMembership.findMany({
      where: { schoolId, status: "ACTIVE", endedAt: null },
      select: { coachId: true, coach: { select: { user: { select: { name: true, email: true } } } } },
    }),
  ]);

  const athleteCandidates: PersonRow[] = schoolAthletes
    .filter((row) => !memberAthleteIds.has(row.athleteId))
    .map((row) => ({
      id: row.athleteId,
      name: row.athlete?.name ?? row.athlete?.email ?? "Sem nome",
      email: row.athlete?.email ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const coachCandidates: PersonRow[] = schoolCoaches
    .filter((row) => !memberCoachIds.has(row.coachId))
    .map((row) => ({
      id: row.coachId,
      name: row.coach?.user?.name ?? "Professor",
      email: row.coach?.user?.email ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const coachMembers: PersonRow[] = team.coaches.map((c) => ({
    id: c.coachId,
    name: c.coach?.user?.name ?? "Professor",
    email: c.coach?.user?.email ?? null,
  }));

  const athleteMembers: PersonRow[] = team.members.map((m) => ({
    id: m.athleteId,
    name: m.athlete?.name ?? m.athlete?.email ?? "Sem nome",
    email: m.athlete?.email ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/escola/${schoolId}/turmas`} className="text-sm text-foreground/50 hover:text-foreground transition-colors">
          ← Turmas
        </Link>
        <h1 className="text-xl font-semibold mt-2">{team.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/60 mt-1">
          {team.sportType && <span>{team.sportType}</span>}
          {team.level && <span>{team.level}</span>}
          {team.location && <span>{team.location}</span>}
          <span className={full ? "text-destructive font-medium" : ""}>
            {team.capacity === null ? `${occupancy} atletas` : `${occupancy} / ${team.capacity} atletas`}
          </span>
        </div>
        {team.archivedAt && (
          <span className="inline-block mt-2">
            <StatusBadge tone="neutral">Turma arquivada</StatusBadge>
          </span>
        )}
      </div>

      {team.notes && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-foreground/60">{team.notes}</div>
      )}

      <SectionCard
        title={`Professores (${coachMembers.length})`}
        description="Professores vinculados podem prescrever treinos para a turma."
      >
        <MembershipPanel
          schoolId={schoolId}
          teamId={team.id}
          kind="coach"
          members={coachMembers}
          candidates={coachCandidates}
          disabled={team.archivedAt !== null}
        />
      </SectionCard>

      <SectionCard
        title={`Atletas (${occupancy})`}
        description={
          team.capacity === null
            ? "Sem limite de vagas declarado."
            : `${Math.max(team.capacity - occupancy, 0)} vaga(s) restante(s) de ${team.capacity}.`
        }
      >
        <MembershipPanel
          schoolId={schoolId}
          teamId={team.id}
          kind="athlete"
          members={athleteMembers}
          candidates={athleteCandidates}
          disabled={team.archivedAt !== null}
        />
      </SectionCard>

    </div>
  );
}
