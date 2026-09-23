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
    <div className="p-6 md:p-10 space-y-6">
      <div>
        <Link href={`/escola/${schoolId}/turmas`} className="text-sm text-muted-foreground hover:underline">
          ← Turmas
        </Link>
        <h1 className="text-xl font-semibold mt-2">{team.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
          {team.sportType && <span>{team.sportType}</span>}
          {team.level && <span>{team.level}</span>}
          {team.location && <span>{team.location}</span>}
          <span className={full ? "text-destructive font-medium" : ""}>
            {team.capacity === null ? `${occupancy} atletas` : `${occupancy} / ${team.capacity} atletas`}
          </span>
        </div>
        {team.archivedAt && (
          <span className="inline-block mt-2 text-xs bg-muted text-muted-foreground rounded px-2 py-0.5">
            Turma arquivada
          </span>
        )}
      </div>

      {team.notes && (
        <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{team.notes}</div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Professores ({team.coaches.length})</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          {team.coaches.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground text-sm">Nenhum professor vinculado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {team.coaches.map((c) => (
                <li key={c.coachId} className="px-4 py-3 text-sm">
                  <span className="font-medium">{c.coach?.user?.name ?? "—"}</span>
                  <span className="text-muted-foreground ml-2">{c.coach?.user?.email ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Atletas ({occupancy})</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          {occupancy === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground text-sm">Nenhum atleta nesta turma.</p>
          ) : (
            <ul className="divide-y divide-border">
              {team.members.map((m) => (
                <li key={m.athleteId} className="px-4 py-3 text-sm">
                  <span className="font-medium">{m.athlete?.name ?? "—"}</span>
                  <span className="text-muted-foreground ml-2">{m.athlete?.email ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
