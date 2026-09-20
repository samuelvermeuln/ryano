/**
 * /atleta/semana — Calendário semanal cross-escola do atleta.
 * Agrega todos os WorkoutAssignments da semana atual de todas as escolas.
 * Navegação por semana via ?week=YYYY-MM-DD (ISO Monday).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SPORT_EMOJI: Record<string, string> = {
  swimming: "🏊", lap_swimming: "🏊", pool_swimming: "🏊", open_water_swimming: "🏊",
  running: "🏃", trail_running: "🏃", treadmill_running: "🏃",
  cycling: "🚴", road_biking: "🚴", mountain_biking: "🚵", indoor_cycling: "🚴",
  strength_training: "🏋️", hiit: "⚡", crossfit: "⚡",
  yoga: "🧘", pilates: "🧘", walking: "🚶", hiking: "🥾", rowing: "🚣", triathlon: "🏅",
};
function sportEmoji(type: string) { return SPORT_EMOJI[type.toLowerCase().replace(/ /g, "_")] ?? "🎯"; }

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
  SCHEDULED:           { label: "Agendado",     dot: "bg-primary",     bg: "" },
  AVAILABLE:           { label: "Disponível",   dot: "bg-primary",     bg: "" },
  COMPLETED:           { label: "Concluído",    dot: "bg-emerald-500", bg: "border-emerald-500/20 bg-emerald-500/5" },
  PARTIALLY_COMPLETED: { label: "Parcial",      dot: "bg-amber-500",   bg: "border-amber-500/20 bg-amber-500/5" },
  MISSED:              { label: "Não realizado",dot: "bg-destructive", bg: "border-destructive/20 bg-destructive/5" },
  RESCHEDULED:         { label: "Reagendado",   dot: "bg-amber-400",   bg: "" },
  JUSTIFIED:           { label: "Justificado",  dot: "bg-sky-500",     bg: "" },
};

function getISOMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

function parseWeekParam(week: string | undefined): Date {
  if (!week) return getISOMonday(new Date());
  const d = new Date(`${week}T00:00:00Z`);
  return isNaN(d.getTime()) ? getISOMonday(new Date()) : getISOMonday(d);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function AtletaSemanaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  const session = await requireOnboardedSession();
  const params = await searchParams;

  const monday = parseWeekParam(params.week);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  const todayISO = new Date().toISOString().slice(0, 10);
  const mondayISO = monday.toISOString().slice(0, 10);
  const sundayISO = sunday.toISOString().slice(0, 10);
  const isCurrentWeek = todayISO >= mondayISO && todayISO <= sundayISO;

  const assignments = await prisma.workoutAssignment.findMany({
    where: {
      athleteId: session.user.id,
      status: { notIn: ["CANCELLED"] },
      scheduledAt: { gte: monday, lte: sunday },
    },
    include: {
      workout: {
        include: {
          blocks: {
            select: { blockType: true, durationS: true, distanceM: true, repetitions: true, targetPayload: true },
            orderBy: { position: "asc" },
          },
        },
      },
      school: { select: { id: true, name: true } },
      executions: {
        where: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } },
        select: { id: true, durationSeconds: true, distanceMeters: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Build Mon–Sun grid
  type DayEntry = {
    dayIndex: number;
    label: string;
    short: string;
    dateLabel: string;
    isoDate: string;
    isToday: boolean;
    isPast: boolean;
    items: typeof assignments;
  };

  const days: DayEntry[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + offset);
    const dayIndex = d.getUTCDay();
    const isoDay = d.toISOString().slice(0, 10);
    days.push({
      dayIndex,
      label: DAY_NAMES[dayIndex],
      short: DAY_SHORT[dayIndex],
      dateLabel: fmtDate(d),
      isoDate: isoDay,
      isToday: isoDay === todayISO,
      isPast: isoDay < todayISO,
      items: assignments.filter((a) => a.scheduledAt && a.scheduledAt.toISOString().slice(0, 10) === isoDay),
    });
  }

  const totalWorkouts = assignments.length;
  const completed = assignments.filter((a) => ["COMPLETED", "PARTIALLY_COMPLETED"].includes(a.status)).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-white/8 px-4 py-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <Link href="/app/dashboard" className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors">
                ← Dashboard
              </Link>
              <h1 className="text-xl font-semibold mt-1">
                {fmtDate(monday)} – {fmtDate(sunday)}
                {isCurrentWeek && (
                  <span className="ml-2 text-xs text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    Esta semana
                  </span>
                )}
              </h1>
            </div>

            {/* Week navigation */}
            <div className="flex items-center gap-1">
              <Link
                href={`/atleta/semana?week=${prevMonday.toISOString().slice(0, 10)}`}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              >
                ←
              </Link>
              {!isCurrentWeek && (
                <Link
                  href="/atleta/semana"
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                >
                  Hoje
                </Link>
              )}
              <Link
                href={`/atleta/semana?week=${nextMonday.toISOString().slice(0, 10)}`}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              >
                →
              </Link>
            </div>
          </div>

          {/* Week summary */}
          {totalWorkouts > 0 && (
            <div className="flex gap-4 mt-3 text-xs text-foreground/50">
              <span>{totalWorkouts} treino{totalWorkouts !== 1 ? "s" : ""}</span>
              {completed > 0 && (
                <span className="text-emerald-400">
                  {completed} concluído{completed !== 1 ? "s" : ""}
                </span>
              )}
              {isCurrentWeek && totalWorkouts - completed > 0 && (
                <span>{totalWorkouts - completed} restante{totalWorkouts - completed !== 1 ? "s" : ""}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Days */}
      <div className="max-w-4xl mx-auto px-4 py-6 md:px-8 space-y-3">
        {days.map((day) => (
          <div
            key={day.isoDate}
            className={`rounded-2xl border transition-colors ${
              day.isToday
                ? "border-primary/30 bg-primary/5"
                : day.isPast && day.items.length === 0
                ? "border-white/5 opacity-40"
                : "border-white/8 bg-white/[0.02]"
            }`}
          >
            {/* Day header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${day.isToday ? "border-primary/20" : "border-white/6"}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${day.isToday ? "text-primary" : day.isPast ? "text-foreground/40" : "text-foreground/80"}`}>
                  {day.label}
                </span>
                <span className={`text-xs ${day.isToday ? "text-primary/70" : "text-foreground/30"}`}>
                  {day.dateLabel}
                </span>
                {day.isToday && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold">Hoje</span>
                )}
              </div>
              {day.items.length > 0 && (
                <span className="text-xs text-foreground/40">
                  {day.items.length} treino{day.items.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Workouts for the day */}
            <div className="px-3 py-2.5 space-y-2">
              {day.items.length === 0 ? (
                <p className="text-xs text-foreground/25 py-1 pl-1">Descanso</p>
              ) : (
                day.items.map((a) => {
                  const cfg = STATUS_CONFIG[a.status] ?? { label: a.status, dot: "bg-foreground/20", bg: "" };
                  const exec = a.executions[0] ?? null;
                  const workout = a.workout;
                  const totalDuration = workout?.blocks.reduce((s, b) => s + (b.durationS ?? 0), 0) ?? 0;
                  const totalDistance = workout?.blocks.reduce((s, b) => s + Number(b.distanceM ?? 0), 0) ?? 0;

                  return (
                    <Link
                      key={a.id}
                      href={`/atleta/${a.school?.id}/treinos/${a.id}`}
                      className={`flex gap-3 rounded-xl border px-3 py-3 hover:opacity-90 transition-opacity ${cfg.bg || "border-white/8 bg-white/[0.03]"}`}
                    >
                      <span className="text-xl leading-none mt-0.5 shrink-0">
                        {sportEmoji(workout?.sportType ?? "")}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">
                            {workout?.title ?? "Treino agendado"}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {exec && <span className="text-xs text-emerald-400 font-medium">✓</span>}
                            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} title={cfg.label} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-foreground/50">
                          <span>{humanizeActivityLabel(workout?.sportType ?? "") ?? workout?.sportType}</span>
                          {a.school && <span>· {a.school.name}</span>}
                          {totalDuration > 0 && <span>· {formatDuration(totalDuration)}</span>}
                          {totalDistance > 0 && <span>· {(totalDistance / 1000).toFixed(1)} km</span>}
                        </div>
                        {/* Quick prescribed vs executed */}
                        {exec && (exec.durationSeconds != null || exec.distanceMeters != null) && (
                          <div className="flex gap-3 text-xs pt-0.5">
                            {exec.durationSeconds != null && (
                              <span className="text-foreground/40">
                                Realizado:{" "}
                                <span className="text-foreground/70">{formatDuration(exec.durationSeconds)}</span>
                              </span>
                            )}
                            {exec.distanceMeters != null && (
                              <span className="text-foreground/40">
                                {(exec.distanceMeters / 1000).toFixed(2)} km
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        ))}

        {assignments.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-5xl">📆</p>
            <p className="text-sm text-foreground/50">Nenhum treino agendado nesta semana.</p>
            <Link href="/app/dashboard" className="inline-block text-xs text-primary underline underline-offset-2">
              Voltar ao dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
