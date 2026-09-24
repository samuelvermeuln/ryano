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

      <SectionCard title={`Professores (${team.coaches.length})`}>
        {team.coaches.length === 0 ? (
          <p className="text-center text-foreground/40 text-sm py-6">Nenhum professor vinculado.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {team.coaches.map((c) => (
              <li key={c.coachId} className="flex items-center justify-between py-2.5 gap-4 text-sm">
                <span className="font-medium">{c.coach?.user?.name ?? "—"}</span>
                <span className="text-foreground/50">{c.coach?.user?.email ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Atletas (${occupancy})`}>
        {occupancy === 0 ? (
          <p className="text-center text-foreground/40 text-sm py-6">Nenhum atleta nesta turma.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {team.members.map((m) => (
              <li key={m.athleteId} className="flex items-center justify-between py-2.5 gap-4 text-sm">
                <span className="font-medium">{m.athlete?.name ?? "—"}</span>
                <span className="text-foreground/50">{m.athlete?.email ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
