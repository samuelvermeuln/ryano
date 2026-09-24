/**
 * T256 — Tela atletas
 * T257 — Lobby: atletas sem professor atribuído
 * Lista atletas, mostra professor atual e indica quem está no "lobby" (sem coach).
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";

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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Atletas</h1>

      {/* T257 — Lobby */}
      {lobby.length > 0 && (
        <section className="theme-panel-warning rounded-2xl border p-5 space-y-3">
          <h2 className="text-sm font-semibold">
            Lobby — sem professor atribuído ({lobby.length})
          </h2>
          <ul className="space-y-2">
            {lobby.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{a.athlete.name ?? a.athlete.email}</span>
                <span className="text-xs opacity-70">Aguardando atribuição</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active athletes */}
      <SectionCard title={`Ativos (${active.length})`}>
        {active.length === 0 ? (
          <p className="text-center text-sm text-foreground/40 py-8">Nenhum atleta ativo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                  <th className="py-3 pr-4 font-medium">Atleta</th>
                  <th className="py-3 pr-4 font-medium">Professor atual</th>
                  <th className="py-3 pr-4 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {active.map((a) => (
                  <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-medium">{a.athlete.name ?? "—"}</span>
                      <span className="block text-xs text-foreground/50">{a.athlete.email}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {coachByAthlete[a.athleteId]?.coach.user.name ?? (
                        <StatusBadge tone="warning">Lobby</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-foreground/50 text-xs">
                      {new Date(a.startedAt ?? a.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {inactive.length > 0 && (
        <SectionCard title={`Inativos (${inactive.length})`}>
          <ul className="divide-y divide-white/5">
            {inactive.map((a) => (
              <li key={a.id} className="text-sm text-foreground/60 py-2">
                {a.athlete.name ?? a.athlete.email} — <span className="text-xs">{a.status}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
