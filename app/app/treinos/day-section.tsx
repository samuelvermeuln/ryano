import { WorkoutCard } from "./workout-card";
import type { AssignmentWithDetails } from "./queries";

/** Header + list of workout cards for a single day. Shared by day-view (one
 *  section, more breathing room) and week-view (seven sections in a row). */
export function DaySection({
  label,
  dateLabel,
  isToday,
  isPast,
  isFuture,
  items,
}: {
  label: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  items: AssignmentWithDetails[];
}) {
  return (
    <div
      className={[
        "rounded-2xl border overflow-hidden transition-colors",
        isToday
          ? "border-primary/30 bg-primary/5"
          : isPast && items.length === 0
            ? "border-white/5 opacity-35"
            : "border-white/8 bg-white/[0.018]",
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center justify-between px-4 py-2.5 border-b",
          isToday ? "border-primary/20" : "border-white/6",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          <span
            className={[
              "text-sm font-semibold",
              isToday ? "text-primary" : isPast ? "text-foreground/40" : "text-foreground/80",
            ].join(" ")}
          >
            {label}
          </span>
          <span className={`text-xs ${isToday ? "text-primary/60" : "text-foreground/30"}`}>{dateLabel}</span>
          {isToday && (
            <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-bold leading-none">
              HOJE
            </span>
          )}
        </div>
        {items.length > 0 && (
          <span className="text-xs text-foreground/35">
            {items.length} treino{items.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {items.length === 0 ? (
          <p className="py-1 pl-1 text-xs text-foreground/22">
            {isFuture ? "Nenhum treino agendado" : "Descanso"}
          </p>
        ) : (
          items.map((assignment) => <WorkoutCard key={assignment.id} assignment={assignment} />)
        )}
      </div>
    </div>
  );
}
