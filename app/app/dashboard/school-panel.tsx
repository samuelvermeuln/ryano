import Link from "next/link";
import { humanizeActivityLabel } from "@/lib/activity-text";

type WorkoutItem = {
  id: string;
  scheduledAt: Date | null;
  status: string;
  workout: { title: string; sportType: string } | null;
};

type Membership = {
  schoolId: string;
  school: {
    name: string;
    slug: string;
  };
  coachAssignment: {
    coach: {
      displayName: string;
    };
  } | null;
  nextWorkout: WorkoutItem | null;
  totalUpcoming: number;
};

type Props = {
  memberships: Membership[];
};

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatScheduledAt(d: Date | null): string {
  if (!d) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff > 0 && diff < 7) return DAY_SHORT[new Date(d).getDay()];
  return new Date(d).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

const SPORT_EMOJI: Record<string, string> = {
  swimming: "🏊",
  lap_swimming: "🏊",
  pool_swimming: "🏊",
  open_water_swimming: "🏊",
  running: "🏃",
  trail_running: "🏃",
  treadmill_running: "🏃",
  cycling: "🚴",
  road_biking: "🚴",
  mountain_biking: "🚵",
  indoor_cycling: "🚴",
  strength_training: "🏋️",
  hiit: "⚡",
  crossfit: "⚡",
  yoga: "🧘",
  pilates: "🧘",
  walking: "🚶",
  hiking: "🥾",
  rowing: "🚣",
  triathlon: "🏅",
};

function sportEmoji(type: string): string {
  const key = type.toLowerCase().replace(/ /g, "_");
  return SPORT_EMOJI[key] ?? "🎯";
}

export function SchoolPanel({ memberships }: Props) {
  if (memberships.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 flex flex-col items-center gap-3 text-center">
        <p className="text-4xl">🏫</p>
        <div>
          <p className="font-semibold text-sm">Nenhuma escola vinculada</p>
          <p className="text-xs text-foreground/50 mt-1">
            Conecte-se a uma escola de natação, assessoria de corrida, crossfit…
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          <Link
            href="/escola/buscar"
            className="rounded-xl bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
          >
            Encontrar escola
          </Link>
          <Link
            href="/escola/criar"
            className="rounded-xl border border-white/15 text-xs font-medium px-4 py-2 hover:bg-white/5 transition-colors"
          >
            Criar escola
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {memberships.map((m) => (
        <Link
          key={m.schoolId}
          href={`/atleta/${m.schoolId}`}
          className="group relative rounded-2xl border border-white/8 bg-white/[0.03] p-4 flex flex-col gap-3 hover:bg-white/[0.06] hover:border-white/15 transition-all"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{m.school.name}</p>
              {m.coachAssignment && (
                <p className="text-xs text-foreground/50 truncate mt-0.5">
                  👤 {m.coachAssignment.coach.displayName}
                </p>
              )}
            </div>
            {m.totalUpcoming > 0 && (
              <span className="shrink-0 text-xs rounded-full bg-primary/15 text-primary px-2 py-0.5 font-semibold">
                {m.totalUpcoming} treino{m.totalUpcoming !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Next workout */}
          {m.nextWorkout ? (
            <div className="rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5 flex items-center gap-2.5">
              <span className="text-xl leading-none">
                {sportEmoji(m.nextWorkout.workout?.sportType ?? "")}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {m.nextWorkout.workout?.title ?? "Treino agendado"}
                </p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  {humanizeActivityLabel(m.nextWorkout.workout?.sportType ?? "") ?? m.nextWorkout.workout?.sportType}
                  {m.nextWorkout.scheduledAt && (
                    <> · <span className="text-primary/80">{formatScheduledAt(m.nextWorkout.scheduledAt)}</span></>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-foreground/30 italic">Nenhum treino agendado</p>
          )}

          {/* Footer links */}
          <div className="flex gap-3 pt-0.5">
            <span className="text-xs text-foreground/40 group-hover:text-foreground/70 transition-colors">
              Ver painel →
            </span>
            <Link
              href={`/atleta/${m.schoolId}/calendario`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
            >
              Calendário
            </Link>
          </div>
        </Link>
      ))}

      {/* CTA to add more */}
      <Link
        href="/escola/buscar"
        className="rounded-2xl border border-dashed border-white/10 bg-transparent p-4 flex flex-col items-center justify-center gap-1.5 hover:border-white/20 hover:bg-white/[0.02] transition-all min-h-[120px]"
      >
        <span className="text-2xl">+</span>
        <p className="text-xs text-foreground/40 text-center">Adicionar modalidade</p>
      </Link>
    </div>
  );
}
