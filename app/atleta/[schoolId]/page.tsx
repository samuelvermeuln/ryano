/**
 * Dashboard do atleta: próximos treinos, compliance pessoal, professor atual.
 * T293 — Exibe professor atual e opção de solicitar novo (se aplicável).
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function AtletaDashboardPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [coachAssignment, upcoming, avgCompliance, pendingFeedback] = await Promise.all([
    // T293 — current coach
    prisma.coachAthleteAssignment.findFirst({
      where: { schoolId, athleteId: session.user.id, endedAt: null },
      include: { coach: { include: { user: { select: { name: true, image: true } } } } },
    }),
    // T294 — upcoming assignments
    prisma.workoutAssignment.findMany({
      where: {
        schoolId,
        athleteId: session.user.id,
        status: { in: ["SCHEDULED", "AVAILABLE"] },
        scheduledAt: { gte: now, lte: weekFromNow },
      },
      include: { workout: { select: { title: true, sportType: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    // compliance
    prisma.workoutCompliance.aggregate({
      where: { athleteId: session.user.id, assignment: { schoolId } },
      _avg: { overallScore: true },
      _count: true,
    }),
    // feedback pending
    prisma.workoutExecution.count({
      where: {
        athleteId: session.user.id,
        assignment: { schoolId },
        matchStatus: { in: ["CONFIRMED", "OVERRIDDEN"] },
        feedback: null,
      },
    }),
  ]);

  const avgScore = avgCompliance._avg.overallScore;

  return (
    <div className="p-6 md:p-10 space-y-8">
      <h1 className="text-2xl font-semibold">
        Olá, {(session.user.name ?? "Atleta").split(" ")[0]} 👋
      </h1>

      {/* T293 — Professor atual */}
      <section className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
        {coachAssignment ? (
          <>
            {coachAssignment.coach.user.image && (
              <img src={coachAssignment.coach.user.image} alt="" className="w-10 h-10 rounded-full object-cover" />
            )}
            <div>
              <p className="text-xs text-muted-foreground">Seu professor</p>
              <p className="font-medium">{coachAssignment.coach.user.name ?? "—"}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Você está no lobby — sem professor atribuído. Aguarde a escola te atribuir um coach.
          </p>
        )}
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-bold tabular-nums">
            {avgScore != null ? (avgScore / 10).toFixed(1) : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Compliance médio</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-bold tabular-nums">{avgCompliance._count}</p>
          <p className="text-xs text-muted-foreground mt-1">Treinos avaliados</p>
        </div>
        {pendingFeedback > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
            <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{pendingFeedback}</p>
            <p className="text-xs text-muted-foreground mt-1">Feedback pendente</p>
          </div>
        )}
      </div>

      {/* Upcoming workouts */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Próximos 7 dias</h2>
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/atleta/${schoolId}/treinos/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{a.workout?.title ?? "Treino agendado"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.workout?.sportType ?? "—"}</p>
                  </div>
                  {a.scheduledAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.scheduledAt).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/atleta/${schoolId}/calendario`} className="text-sm text-primary underline">
            Ver calendário completo →
          </Link>
        </section>
      )}
    </div>
  );
}
