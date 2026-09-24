/**
 * T508 — Tela de turmas da escola (defeito D1).
 *
 * O painel já oferecia o card "Turmas ativas" com link para cá, mas a rota não
 * existia e devolvia 404.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

/** Mostra "8 / 20" quando há limite declarado e só "8" quando não há. */
function occupancyLabel(occupancy: number, capacity: number | null) {
  return capacity === null ? String(occupancy) : `${occupancy} / ${capacity}`;
}

function isFull(occupancy: number, capacity: number | null) {
  return capacity !== null && occupancy >= capacity;
}

export default async function TurmasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const [school, teams] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } }),
    prisma.team.findMany({
      where: { schoolId, archivedAt: null },
      select: {
        id: true, name: true, sportType: true, level: true, capacity: true, location: true,
        _count: { select: { members: true, coaches: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!school) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Turmas</h1>
        <p className="text-sm text-foreground/50 mt-1">
          {teams.length === 0
            ? "Nenhuma turma ativa."
            : `${teams.length} ${teams.length === 1 ? "turma ativa" : "turmas ativas"}`}
        </p>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="Esta escola ainda não tem turmas ativas"
          description="As turmas agrupam atletas e professores para organizar os treinos."
        />
      ) : (
        <SectionCard title="Turmas">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                  <th className="py-3 pr-4 font-medium">Turma</th>
                  <th className="py-3 pr-4 font-medium">Modalidade</th>
                  <th className="py-3 pr-4 font-medium">Nível</th>
                  <th className="py-3 pr-4 font-medium">Local</th>
                  <th className="py-3 pr-4 font-medium">Atletas</th>
                  <th className="py-3 pr-4 font-medium">Professores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {teams.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 font-medium">
                      <Link href={`/escola/${schoolId}/turmas/${t.id}`} className="hover:underline">{t.name}</Link>
                    </td>
                    <td className="py-3 pr-4 text-foreground/60">{t.sportType ?? "—"}</td>
                    <td className="py-3 pr-4 text-foreground/60">{t.level ?? "—"}</td>
                    <td className="py-3 pr-4 text-foreground/60">{t.location ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <span className={isFull(t._count.members, t.capacity) ? "text-destructive font-medium" : ""}>
                        {occupancyLabel(t._count.members, t.capacity)}
                      </span>
                      {isFull(t._count.members, t.capacity) && (
                        <span className="ml-2">
                          <StatusBadge tone="danger">Lotada</StatusBadge>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-foreground/60">{t._count.coaches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
