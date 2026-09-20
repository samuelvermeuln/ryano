/**
 * T294 — Calendário de treinos do atleta
 * Mostra todos os assignments agrupados por semana.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ month?: string }>;
};

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  // Monday of the ISO week
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(isoMonday: string): string {
  const d = new Date(`${isoMonday}T00:00:00Z`);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(d)} – ${fmt(end)}`;
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  MISSED: "Não realizado",
};

const STATUS_CLS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CANCELLED: "bg-muted text-muted-foreground",
  MISSED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default async function CalendarioPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const assignments = await prisma.workoutAssignment.findMany({
    where: {
      schoolId,
      athleteId: session.user.id,
      status: { not: "CANCELLED" },
    },
    include: {
      workout: { select: { title: true, sportType: true } },
      executions: {
        where: { matchStatus: { in: ["CONFIRMED", "OVERRIDDEN"] } },
        select: { id: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Group by ISO week
  const weeks = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const date = a.scheduledAt ?? a.createdAt;
    const key = getWeekKey(date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(a);
  }
  const sortedWeeks = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="p-6 md:p-10 space-y-8">
      <h1 className="text-xl font-semibold">Calendário de treinos</h1>

      {sortedWeeks.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum treino prescrito ainda.</p>
      )}

      {sortedWeeks.map(([weekKey, items]) => (
        <section key={weekKey} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {formatWeekLabel(weekKey)}
          </h2>
          <ul className="space-y-2">
            {items.map((a) => {
              const hasExecution = a.executions.length > 0;
              return (
                <li key={a.id}>
                  <Link
                    href={`/atleta/${schoolId}/treinos/${a.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{a.workout?.title ?? "Treino agendado"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{a.workout?.sportType ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasExecution && (
                        <span className="text-xs text-green-700 dark:text-green-400">✓ Realizado</span>
                      )}
                      <span className={`text-xs rounded px-2 py-0.5 ${STATUS_CLS[a.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
