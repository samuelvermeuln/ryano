/**
 * T256 — Tela atletas
 * T257 — Lobby: atletas sem professor atribuído
 * Lista atletas, mostra professor atual e indica quem está no "lobby" (sem coach).
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function AtletasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const athletes = await prisma.schoolAthleteMembership.findMany({
    where: { schoolId },
    include: {
      athlete: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const athleteIds = athletes.map((a) => a.athleteId);
  const coachAssignments = await prisma.coachAthleteAssignment.findMany({
    where: { schoolId, athleteId: { in: athleteIds }, endedAt: null },
    include: { coach: { include: { user: { select: { name: true } } } } },
  });
  const coachByAthlete = Object.fromEntries(coachAssignments.map((ca) => [ca.athleteId, ca]));

  const lobby = athletes.filter((a) => !coachByAthlete[a.athleteId] && a.status === "ACTIVE");
  const active = athletes.filter((a) => a.status === "ACTIVE");
  const inactive = athletes.filter((a) => a.status !== "ACTIVE");

  return (
    <div className="p-6 md:p-10 space-y-8">
      <h1 className="text-xl font-semibold">Atletas</h1>

      {/* T257 — Lobby */}
      {lobby.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Lobby — sem professor atribuído ({lobby.length})
          </h2>
          <ul className="space-y-2">
            {lobby.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{a.athlete.name ?? a.athlete.email}</span>
                <span className="text-muted-foreground text-xs">Aguardando atribuição</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active athletes */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ativos ({active.length})</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atleta</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Professor atual</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {active.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium">{a.athlete.name ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{a.athlete.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    {coachByAthlete[a.athleteId]?.coach.user.name ?? (
                      <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Lobby</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(a.startedAt ?? a.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Nenhum atleta ativo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {inactive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Inativos ({inactive.length})</h2>
          <ul className="space-y-1">
            {inactive.map((a) => (
              <li key={a.id} className="text-sm text-muted-foreground px-1">
                {a.athlete.name ?? a.athlete.email} — <span className="text-xs">{a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
