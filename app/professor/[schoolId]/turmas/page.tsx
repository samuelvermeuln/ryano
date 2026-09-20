/**
 * Turmas do professor (teams view from coach perspective)
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

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
    where: {
      schoolId,
      archivedAt: null,
      coaches: { some: { coachId: coachProfile.id } },
    },
    include: {
      _count: { select: { athletes: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 md:p-10 space-y-6">
      <h1 className="text-xl font-semibold">Minhas turmas ({teams.length})</h1>

      {teams.length === 0 && (
        <p className="text-muted-foreground text-sm">Você não está associado a nenhuma turma.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <li key={team.id} className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-medium">{team.name}</p>
            {team.sportType && <p className="text-xs text-muted-foreground capitalize">{team.sportType}</p>}
            <p className="text-sm text-muted-foreground">{team._count.athletes} atleta{team._count.athletes !== 1 ? "s" : ""}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
