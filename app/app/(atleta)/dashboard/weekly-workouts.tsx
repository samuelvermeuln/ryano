import Link from "next/link";
import { humanizeActivityLabel } from "@/lib/activity-text";

type WorkoutEntry = {
  id: string;
  schoolId: string;
  schoolName: string;
  scheduledAt: Date | null;
  status: string;
  matchStatus: string | null;
  workout: { title: string; sportType: string } | null;
};

type Props = {
  entries: WorkoutEntry[];
};

const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  PARTIALLY_COMPLETED: "bg-amber-500",
  MISSED: "bg-destructive",
  CANCELLED: "bg-foreground/20",
  SCHEDULED: "bg-primary",
  AVAILABLE: "bg-primary",
  RESCHEDULED: "bg-amber-400",
  JUSTIFIED: "bg-sky-500",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  AVAILABLE: "Disponível",
  COMPLETED: "Concluído",
  PARTIALLY_COMPLETED: "Parcialmente concluído",
  MISSED: "Não realizado",
  CANCELLED: "Cancelado",
  RESCHEDULED: "Reagendado",
  JUSTIFIED: "Justificado",
};

const SPORT_EMOJI: Record<string, string> = {
  swimming: "🏊", lap_swimming: "🏊", pool_swimming: "🏊", open_water_swimming: "🏊",
  running: "🏃", trail_running: "🏃", treadmill_running: "🏃",
  cycling: "🚴", road_biking: "🚴", mountain_biking: "🚵", indoor_cycling: "🚴",
  strength_training: "🏋️", hiit: "⚡", crossfit: "⚡",
  yoga: "🧘", pilates: "🧘", walking: "🚶", hiking: "🥾", rowing: "🚣", triathlon: "🏅",
};

function sportEmoji(type: string): string {
  return SPORT_EMOJI[type.toLowerCase().replace(/ /g, "_")] ?? "🎯";
}

// Get ISO Monday of a date
function getISOMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

export function WeeklyWorkouts({ entries }: Props) {
  if (entries.length === 0) return null;

  const now = new Date();
  const todayDay = now.getDay();

  // Group by weekday (0=Sun...6=Sat), but show Mon-Sun
  const byDay = new Map<number, WorkoutEntry[]>();
  for (const e of entries) {
    const day = e.scheduledAt ? new Date(e.scheduledAt).getDay() : -1;
    if (day < 0) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  // Build Mon–Sun order
  const orderedDays: Array<{ dayIndex: number; label: string; short: string; isToday: boolean; items: WorkoutEntry[] }> = [];
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = offset % 7; // 1=Mon ... 0=Sun
    const items = byDay.get(dayIndex) ?? [];
    if (items.length > 0) {
      orderedDays.push({
        dayIndex,
        label: DAY_LABELS[dayIndex],
        short: DAY_SHORT[dayIndex],
        isToday: dayIndex === todayDay,
        items,
      });
    }
  }

  if (orderedDays.length === 0) return null;

  const monday = getISOMonday(now);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
  const weekLabel = `${fmt(monday)} – ${fmt(sunday)}`;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">
          Semana · {weekLabel}
        </h2>
        <Link href="/app/treinos" className="text-xs text-primary hover:opacity-80 transition-opacity">
          Ver tudo →
        </Link>
      </div>

      <div className="grid gap-2">
        {orderedDays.map(({ dayIndex, label, isToday, items }) => (
          <div
            key={dayIndex}
            className={`rounded-2xl border p-3 transition-colors ${isToday ? "border-primary/30 bg-primary/5" : "border-white/8 bg-white/[0.02]"}`}
          >
            <p className={`text-xs font-semibold mb-2 ${isToday ? "text-primary" : "text-foreground/50"}`}>
              {label}{isToday ? " · Hoje" : ""}
            </p>
            <div className="flex flex-col gap-1.5">
              {items.map((e) => (
                <Link
                  key={e.id}
                  href={`/atleta/${e.schoolId}/treinos/${e.id}`}
                  className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/6 px-3 py-2 transition-colors"
                >
                  <span className="text-base leading-none">{sportEmoji(e.workout?.sportType ?? "")}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{e.workout?.title ?? "Treino"}</p>
                    <p className="text-xs text-foreground/40 truncate">
                      {humanizeActivityLabel(e.workout?.sportType ?? "") ?? e.workout?.sportType} · {e.schoolName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {e.matchStatus && ["CONFIRMED", "OVERRIDDEN", "AUTO_MATCHED"].includes(e.matchStatus) && (
                      <span className="text-xs text-emerald-400">✓</span>
                    )}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[e.status] ?? "bg-foreground/20"}`} title={STATUS_LABEL[e.status]} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
