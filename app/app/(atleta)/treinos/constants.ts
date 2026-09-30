/**
 * Constantes visuais e de domínio compartilhadas por todas as visões de
 * /app/treinos (dia, semana, mês, ano, lista).
 */

export const DAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const SPORT_EMOJI: Record<string, string> = {
  swimming: "🏊", lap_swimming: "🏊", pool_swimming: "🏊", open_water_swimming: "🏊",
  running: "🏃", trail_running: "🏃", treadmill_running: "🏃",
  cycling: "🚴", road_biking: "🚴", mountain_biking: "🚵", indoor_cycling: "🚴",
  strength_training: "🏋️", hiit: "⚡", crossfit: "⚡",
  yoga: "🧘", pilates: "🧘", walking: "🚶", hiking: "🥾", rowing: "🚣", triathlon: "🏅",
};

export function sportEmoji(type: string) {
  return SPORT_EMOJI[type.toLowerCase().replace(/ /g, "_")] ?? "🎯";
}

export const STATUS_CONFIG: Record<string, { label: string; dot: string; ring: string }> = {
  SCHEDULED:           { label: "Agendado",            dot: "bg-primary",     ring: "border-white/8"            },
  AVAILABLE:           { label: "Disponível",          dot: "bg-primary",     ring: "border-white/8"            },
  COMPLETED:           { label: "Concluído",           dot: "bg-emerald-500", ring: "border-emerald-500/25 bg-emerald-500/5" },
  PARTIALLY_COMPLETED: { label: "Parcialmente feito",  dot: "bg-amber-400",   ring: "border-amber-400/25 bg-amber-400/5"    },
  MISSED:              { label: "Não realizado",       dot: "bg-destructive", ring: "border-destructive/20 bg-destructive/5"},
  RESCHEDULED:         { label: "Reagendado",          dot: "bg-amber-400",   ring: "border-white/8"            },
  JUSTIFIED:           { label: "Justificado",         dot: "bg-sky-500",     ring: "border-sky-500/20"         },
  UNPLANNED:           { label: "Não planejado",       dot: "bg-foreground/30", ring: "border-white/8"          },
};

/** Visual accent for a real (executed) activity in the unified list view — kept
 *  distinct from every color used in STATUS_CONFIG above so a WorkoutAssignment
 *  card and an Activity card are never visually ambiguous side by side. */
export const ACTIVITY_ACCENT = {
  ring: "border-indigo-400/20 bg-indigo-400/5",
  dot: "bg-indigo-400",
  label: "text-indigo-300",
};
