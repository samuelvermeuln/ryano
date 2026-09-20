/**
 * /app/treinos — Calendário semanal completo do atleta.
 *
 * Mostra TODOS os treinos prescritos pelo professor (de todas as escolas e
 * modalidades) versus o realizado. Navegação por semana via ?week=YYYY-MM-DD.
 * Cada card exibe: modalidade (emoji + label), escola/professor, prescrição
 * resumida (duração/distância alvo) e execução real (tempo/distância realizado).
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDuration } from "@/lib/format";

export const metadata = buildNoIndexMetadata({
  title: "Treinos — Ryvano",
  description: "Calendário semanal de treinos prescritos e realizados.",
  path: "/app/treinos",
});

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SPORT_EMOJI: Record<string, string> = {
  swimming: "🏊", lap_swimming: "🏊", pool_swimming: "🏊", open_water_swimming: "🏊",
  running: "🏃", trail_running: "🏃", treadmill_running: "🏃",
  cycling: "🚴", road_biking: "🚴", mountain_biking: "🚵", indoor_cycling: "🚴",
  strength_training: "🏋️", hiit: "⚡", crossfit: "⚡",
  yoga: "🧘", pilates: "🧘", walking: "🚶", hiking: "🥾", rowing: "🚣", triathlon: "🏅",
};
function sportEmoji(type: string) {
  return SPORT_EMOJI[type.toLowerCase().replace(/ /g, "_")] ?? "🎯";
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; ring: string }> = {
  SCHEDULED:           { label: "Agendado",            dot: "bg-primary",     ring: "border-white/8"            },
  AVAILABLE:           { label: "Disponível",          dot: "bg-primary",     ring: "border-white/8"            },
  COMPLETED:           { label: "Concluído",           dot: "bg-emerald-500", ring: "border-emerald-500/25 bg-emerald-500/5" },
  PARTIALLY_COMPLETED: { label: "Parcialmente feito",  dot: "bg-amber-400",   ring: "border-amber-400/25 bg-amber-400/5"    },
  MISSED:              { label: "Não realizado",       dot: "bg-destructive", ring: "border-destructive/20 bg-destructive/5"},
  RESCHEDULED:         { label: "Reagendado",          dot: "bg-amber-400",   ring: "border-white/8"            },
  JUSTIFIED:           { label: "Justificado",         dot: "bg-sky-500",     ring: "border-sky-500/20"         },
  UNPLANNED:           { label: "Não planejado",       dot: "bg-foreground/30", ring: "border-white/8"          },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function fmtShort(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TreinosPage({
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
  const isCurrentWeek = todayISO >= mondayISO && todayISO <= sunday.toISOString().slice(0, 10);

  // Fetch all assignments for this athlete in the week window
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
            select: {
              blockType: true,
              durationS: true,
              distanceM: true,
              repetitions: true,
              targetPayload: true,
            },
            orderBy: { position: "asc" },
          },
        },
      },
      workoutTemplate: { select: { title: true, sportType: true } },
      school: { select: { id: true, name: true, slug: true } },
      coach: { select: { id: true, displayName: true } },
      executions: {
        where: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } },
        select: {
          id: true,
          durationSeconds: true,
          movingSeconds: true,
          distanceMeters: true,
          averageHeartRate: true,
          averageSpeed: true,
          elevationGain: true,
          sportType: true,
        },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  type Assignment = (typeof assignments)[number];

  // Build Mon–Sun grid
  const days: {
    dayIndex: number;
    label: string;
    short: string;
    dateLabel: string;
    isoDate: string;
    date: Date;
    isToday: boolean;
    isPast: boolean;
    isFuture: boolean;
    items: Assignment[];
  }[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + offset);
    const isoDay = d.toISOString().slice(0, 10);
    days.push({
      dayIndex: d.getUTCDay(),
      label: DAY_NAMES[d.getUTCDay()],
      short: DAY_SHORT[d.getUTCDay()],
      dateLabel: fmtDay(d),
      isoDate: isoDay,
      date: d,
      isToday: isoDay === todayISO,
      isPast: isoDay < todayISO,
      isFuture: isoDay > todayISO,
      items: assignments.filter(
        (a) => a.scheduledAt && a.scheduledAt.toISOString().slice(0, 10) === isoDay,
      ),
    });
  }

  const totalWorkouts = assignments.length;
  const completedCount = assignments.filter((a) =>
    ["COMPLETED", "PARTIALLY_COMPLETED"].includes(a.status),
  ).length;
  const missedCount = assignments.filter((a) => a.status === "MISSED").length;

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Treinos</h1>
          <p className="text-sm text-foreground/50 mt-0.5">
            {fmtShort(monday)} – {fmtShort(sunday)}
            {isCurrentWeek && (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                Esta semana
              </span>
            )}
          </p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-1.5">
          <Link
            href={`/app/treinos?week=${prevMonday.toISOString().slice(0, 10)}`}
            className="rounded-xl border border-white/12 px-3 py-2 text-sm hover:bg-white/6 transition-colors"
            title="Semana anterior"
          >
            ←
          </Link>
          {!isCurrentWeek && (
            <Link
              href="/app/treinos"
              className="rounded-xl border border-white/12 px-3 py-2 text-xs font-medium hover:bg-white/6 transition-colors"
            >
              Hoje
            </Link>
          )}
          <Link
            href={`/app/treinos?week=${nextMonday.toISOString().slice(0, 10)}`}
            className="rounded-xl border border-white/12 px-3 py-2 text-sm hover:bg-white/6 transition-colors"
            title="Próxima semana"
          >
            →
          </Link>
        </div>
      </div>

      {/* ── Week summary chips ── */}
      {totalWorkouts > 0 && (
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="rounded-full bg-white/8 px-3 py-1 text-foreground/60">
            {totalWorkouts} treino{totalWorkouts !== 1 ? "s" : ""}
          </span>
          {completedCount > 0 && (
            <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-emerald-400 font-medium">
              ✓ {completedCount} concluído{completedCount !== 1 ? "s" : ""}
            </span>
          )}
          {missedCount > 0 && (
            <span className="rounded-full bg-destructive/12 px-3 py-1 text-destructive font-medium">
              {missedCount} não realizado{missedCount !== 1 ? "s" : ""}
            </span>
          )}
          {isCurrentWeek && totalWorkouts - completedCount - missedCount > 0 && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary/80">
              {totalWorkouts - completedCount - missedCount} restante{totalWorkouts - completedCount - missedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* ── Day columns ── */}
      <div className="space-y-2">
        {days.map((day) => (
          <div
            key={day.isoDate}
            className={[
              "rounded-2xl border overflow-hidden transition-colors",
              day.isToday
                ? "border-primary/30 bg-primary/5"
                : day.isPast && day.items.length === 0
                  ? "border-white/5 opacity-35"
                  : "border-white/8 bg-white/[0.018]",
            ].join(" ")}
          >
            {/* Day header */}
            <div
              className={[
                "flex items-center justify-between px-4 py-2.5 border-b",
                day.isToday ? "border-primary/20" : "border-white/6",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "text-sm font-semibold",
                    day.isToday ? "text-primary" : day.isPast ? "text-foreground/40" : "text-foreground/80",
                  ].join(" ")}
                >
                  {day.label}
                </span>
                <span className={`text-xs ${day.isToday ? "text-primary/60" : "text-foreground/30"}`}>
                  {day.dateLabel}
                </span>
                {day.isToday && (
                  <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-bold leading-none">
                    HOJE
                  </span>
                )}
              </div>
              {day.items.length > 0 && (
                <span className="text-xs text-foreground/35">
                  {day.items.length} treino{day.items.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Workout cards */}
            <div className="px-3 py-2.5 space-y-2">
              {day.items.length === 0 ? (
                <p className="py-1 pl-1 text-xs text-foreground/22">
                  {day.isFuture ? "Nenhum treino agendado" : "Descanso"}
                </p>
              ) : (
                day.items.map((a) => {
                  const cfg = STATUS_CONFIG[a.status] ?? {
                    label: a.status,
                    dot: "bg-foreground/20",
                    ring: "border-white/8",
                  };
                  const exec = a.executions[0] ?? null;
                  const workout = a.workout;
                  const templateName = a.workoutTemplate?.title;
                  const sportType =
                    workout?.sportType ?? a.workoutTemplate?.sportType ?? "";

                  // Prescribed totals from blocks
                  const prescribedDuration = workout?.blocks.reduce(
                    (s, b) => s + (b.durationS ?? 0),
                    0,
                  ) ?? 0;
                  const prescribedDistance = workout?.blocks.reduce(
                    (s, b) => s + Number(b.distanceM ?? 0),
                    0,
                  ) ?? 0;

                  const isMatched = !!exec;
                  const schoolPath = a.school ? `/atleta/${a.school.id}/treinos/${a.id}` : "#";

                  return (
                    <Link
                      key={a.id}
                      href={schoolPath}
                      className={[
                        "flex gap-3 rounded-xl border px-3.5 py-3 hover:opacity-90 transition-opacity",
                        cfg.ring,
                      ].join(" ")}
                    >
                      {/* Sport emoji */}
                      <span className="text-2xl leading-none mt-0.5 shrink-0">
                        {sportEmoji(sportType)}
                      </span>

                      {/* Main content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Title row */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">
                            {workout?.title ?? templateName ?? "Treino agendado"}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isMatched && (
                              <span
                                className="text-[10px] font-bold text-emerald-400 bg-emerald-500/12 rounded-full px-1.5 py-0.5 leading-none"
                                title="Atividade registrada"
                              >
                                ✓
                              </span>
                            )}
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`}
                              title={cfg.label}
                            />
                          </div>
                        </div>

                        {/* Meta row: sport + school + coach */}
                        <div className="flex items-center gap-1.5 flex-wrap text-xs text-foreground/45">
                          <span className="font-medium text-foreground/60">
                            {humanizeActivityLabel(sportType) ?? sportType}
                          </span>
                          {a.school && (
                            <>
                              <span className="text-foreground/25">·</span>
                              <span>{a.school.name}</span>
                            </>
                          )}
                          {a.coach && (
                            <>
                              <span className="text-foreground/25">·</span>
                              <span>{a.coach.displayName}</span>
                            </>
                          )}
                          <span className="text-foreground/25">·</span>
                          <span
                            className={[
                              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              cfg.dot === "bg-emerald-500"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : cfg.dot === "bg-destructive"
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-white/6 text-foreground/45",
                            ].join(" ")}
                          >
                            {cfg.label}
                          </span>
                        </div>

                        {/* Prescribed vs Executed comparison */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-0.5">
                          {/* Prescribed */}
                          {(prescribedDuration > 0 || prescribedDistance > 0) && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] uppercase tracking-wider text-foreground/30 font-semibold">
                                Prescrito
                              </p>
                              <div className="flex gap-2 text-xs text-foreground/55">
                                {prescribedDuration > 0 && (
                                  <span>{formatDuration(prescribedDuration)}</span>
                                )}
                                {prescribedDistance > 0 && (
                                  <span>{(prescribedDistance / 1000).toFixed(2)} km</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Executed */}
                          {exec && (exec.durationSeconds != null || exec.distanceMeters != null) && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-semibold">
                                Realizado
                              </p>
                              <div className="flex gap-2 text-xs text-emerald-400/80">
                                {exec.durationSeconds != null && (
                                  <span>{formatDuration(exec.durationSeconds)}</span>
                                )}
                                {exec.distanceMeters != null && (
                                  <span>{(exec.distanceMeters / 1000).toFixed(2)} km</span>
                                )}
                                {exec.averageHeartRate != null && (
                                  <span className="text-foreground/40">
                                    ♡ {exec.averageHeartRate} bpm
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Empty state ── */}
      {totalWorkouts === 0 && (
        <div className="py-20 text-center space-y-3">
          <p className="text-5xl">📆</p>
          <p className="text-sm text-foreground/50">
            Nenhum treino agendado nesta semana.
          </p>
          <p className="text-xs text-foreground/35">
            Os treinos aparecem aqui quando seu professor ou escola os agendarem.
          </p>
          {!isCurrentWeek && (
            <Link
              href="/app/treinos"
              className="inline-block text-xs text-primary underline underline-offset-2"
            >
              Ver semana atual
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
