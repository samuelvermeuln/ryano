/**
 * T253 — Tela dashboard administrativo
 * Visão operacional da escola: quem treinou, quem está atrasado e adesão da
 * semana. Deliberadamente NÃO exibe métricas de wearable (prontidão, sono,
 * HRV, Body Battery): a escola não conecta relógio próprio, e biometria do
 * atleta depende de `HistoryAccessGrant` concedido pelo próprio atleta. As
 * execuções abaixo são dados que o atleta já compartilhou com a escola ao
 * executar um treino prescrito por ela.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

/** Prescrito e ainda não executado — os estados que podem vencer. */
const OPEN_STATUSES = ["SCHEDULED", "AVAILABLE"] as const;

function startOfUtcDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date | null) {
  return date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
}

function daysLate(from: Date, today: Date) {
  return Math.floor((today.getTime() - from.getTime()) / 86_400_000);
}

export async function getSchoolOverview(schoolId: string) {
  const today = startOfUtcDay(new Date());
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() || 7) + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const [
    school,
    athleteCount,
    coachCount,
    teamCount,
    pendingAthleteRequests,
    pendingCoachRequests,
    overdue,
    weekAssignments,
    recentExecutions,
  ] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true },
    }),
    prisma.schoolAthleteMembership.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.coachSchoolMembership.count({ where: { schoolId, status: "ACTIVE", endedAt: null } }),
    prisma.team.count({ where: { schoolId, archivedAt: null } }),
    // O card leva à tela de solicitações, que lista atletas E professores
    // pendentes. O mesmo `where` das duas listas é reproduzido aqui para que o
    // número e a lista nunca discordem.
    prisma.schoolAthleteMembership.count({ where: { schoolId, status: "PENDING" } }),
    prisma.coachSchoolMembership.count({ where: { schoolId, status: "PENDING" } }),
    prisma.workoutAssignment.findMany({
      where: { schoolId, status: { in: [...OPEN_STATUSES] }, scheduledAt: { lt: today } },
      select: {
        id: true,
        scheduledAt: true,
        athlete: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    }),
    prisma.workoutAssignment.groupBy({
      by: ["status"],
      where: { schoolId, scheduledAt: { gte: weekStart, lt: weekEnd } },
      _count: true,
    }),
    prisma.workoutExecution.findMany({
      where: { assignment: { schoolId } },
      select: {
        id: true,
        startedAt: true,
        source: true,
        athlete: { select: { id: true, name: true, email: true } },
        assignment: { select: { workout: { select: { title: true } } } },
        compliance: { select: { overallScore: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    school,
    athleteCount,
    coachCount,
    teamCount,
    pendingRequests: pendingAthleteRequests + pendingCoachRequests,
    overdue,
    weekAssignments,
    recentExecutions,
    today,
  };
}

export default async function EscolaDashboardPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;
  const data = await getSchoolOverview(schoolId);
  if (!data.school) notFound();

  const weekTotal = data.weekAssignments.reduce((sum, g) => sum + g._count, 0);
  const weekDone = data.weekAssignments
    .filter((g) => g.status === "COMPLETED" || g.status === "PARTIALLY_COMPLETED")
    .reduce((sum, g) => sum + g._count, 0);

  // A escola age sobre a pessoa, não sobre a linha de treino: agrupa por atleta.
  const lateByAthlete = new Map<string, { name: string; count: number; oldest: Date | null }>();
  for (const a of data.overdue) {
    const entry = lateByAthlete.get(a.athlete.id) ?? {
      name: a.athlete.name ?? a.athlete.email ?? "Atleta",
      count: 0,
      oldest: a.scheduledAt,
    };
    entry.count += 1;
    if (a.scheduledAt && (!entry.oldest || a.scheduledAt < entry.oldest)) entry.oldest = a.scheduledAt;
    lateByAthlete.set(a.athlete.id, entry);
  }
  const lateRanking = [...lateByAthlete.entries()].sort((a, b) => b[1].count - a[1].count);

  const stats = [
    { label: "Atletas ativos", value: data.athleteCount, href: `/escola/${schoolId}/atletas` },
    { label: "Professores ativos", value: data.coachCount, href: `/escola/${schoolId}/professores` },
    { label: "Turmas ativas", value: data.teamCount, href: `/escola/${schoolId}/turmas` },
    {
      label: "Solicitações pendentes",
      value: data.pendingRequests,
      href: `/escola/${schoolId}/solicitacoes`,
    },
    { label: "Treinos na semana", value: weekTotal, href: null },
    { label: "Concluídos na semana", value: `${weekDone}/${weekTotal}`, href: null },
  ];

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{data.school.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão operacional da escola</p>
        {data.school.status !== "ACTIVE" && (
          <span className="text-sm text-destructive font-medium">Escola desativada</span>
        )}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, href }) => {
          const body = (
            <>
              <p className="text-3xl font-bold tabular-nums">{value}</p>
              <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </>
          );
          return (
            <li key={label} className="rounded-xl border border-border bg-card p-5">
              {href ? (
                <Link href={href} className="block hover:opacity-80 transition-opacity">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Planos de treino atrasados
        </h2>
        {lateRanking.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nenhum treino vencido sem execução. A escola está em dia.
          </p>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-100/60 dark:bg-amber-900/30">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Atleta</th>
                  <th className="text-left px-4 py-3 font-medium">Treinos vencidos</th>
                  <th className="text-left px-4 py-3 font-medium">Mais antigo</th>
                </tr>
              </thead>
              <tbody>
                {lateRanking.map(([athleteId, info]) => (
                  <tr
                    key={athleteId}
                    className="border-t border-amber-200/70 dark:border-amber-900/60"
                  >
                    <td className="px-4 py-3 font-medium">{info.name}</td>
                    <td className="px-4 py-3 tabular-nums">{info.count}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(info.oldest)}
                      {info.oldest ? (
                        <span className="ml-1 text-xs">({daysLate(info.oldest, data.today)}d)</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Execuções recentes
          </h2>
          <span className="text-xs text-muted-foreground">Sincronizado do relógio do atleta</span>
        </div>
        {data.recentExecutions.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nenhuma execução registrada ainda. Um treino aparece aqui quando o atleta o conclui e a
            atividade do relógio dele é associada ao treino prescrito.
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atleta</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Treino</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Quando</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origem</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Aderência
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentExecutions.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{e.athlete.name ?? e.athlete.email}</td>
                    <td className="px-4 py-3">{e.assignment.workout?.title ?? "Treino agendado"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(e.startedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{e.source}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {e.compliance ? `${(e.compliance.overallScore / 10).toFixed(1)}/10` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
