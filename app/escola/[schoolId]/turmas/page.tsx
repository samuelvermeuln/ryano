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
    <div className="p-6 md:p-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Turmas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {teams.length === 0
            ? "Nenhuma turma ativa."
            : `${teams.length} ${teams.length === 1 ? "turma ativa" : "turmas ativas"}`}
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center">
          <p className="text-muted-foreground">Esta escola ainda não tem turmas ativas.</p>
          <p className="text-sm text-muted-foreground mt-2">
            As turmas agrupam atletas e professores para organizar os treinos.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Turma</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modalidade</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nível</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Local</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atletas</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Professores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/escola/${schoolId}/turmas/${t.id}`} className="hover:underline">{t.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.sportType ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.level ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={isFull(t._count.members, t.capacity) ? "text-destructive font-medium" : ""}>
                      {occupancyLabel(t._count.members, t.capacity)}
                    </span>
                    {isFull(t._count.members, t.capacity) && (
                      <span className="ml-2 text-xs bg-destructive/10 text-destructive rounded px-2 py-0.5">Lotada</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t._count.coaches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
