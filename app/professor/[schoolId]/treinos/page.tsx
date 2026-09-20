/**
 * T273 — Editor de treino (lista de treinos/templates do professor)
 * T275 — Biblioteca de templates
 * T276 — Fluxo atribuir treino (link para ação)
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function TreinosPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const [recentAssignments, templates] = await Promise.all([
    prisma.workoutAssignment.findMany({
      where: { schoolId, coachId: coachProfile.id },
      include: {
        workout: { select: { title: true, sportType: true } },
        athlete: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 30,
    }),
    // T275 — Templates library
    prisma.workoutTemplate.findMany({
      where: {
        OR: [
          { ownerType: "COACH", ownerId: coachProfile.id },
          { authorCoachId: coachProfile.id },
          { schoolId },
        ],
        status: { not: "ARCHIVED" },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Treinos</h1>
      </div>

      {/* T275 — Templates library */}
      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Biblioteca de templates ({templates.length})
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <li key={t.id} className="rounded-xl border border-border bg-card p-4 space-y-1">
                <p className="font-medium text-sm">{t.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{t.sportType ?? "—"}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent prescriptions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Prescrições recentes ({recentAssignments.length})
        </h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Treino</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atleta</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentAssignments.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.workout?.title ?? "Treino agendado"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.workout?.sportType ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">{a.athlete.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.scheduledAt ? new Date(a.scheduledAt).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded px-2 py-0.5 ${
                      a.status === "COMPLETED" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : a.status === "SCHEDULED" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                    }`}>{a.status}</span>
                  </td>
                </tr>
              ))}
              {recentAssignments.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma prescrição encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
