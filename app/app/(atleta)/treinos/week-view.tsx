import { DAY_NAMES, DAY_SHORT } from "./constants";
import { addDaysUTC, fmtDay, toISODate, todayUTC } from "./date-helpers";
import { TreinosEmptyState } from "./treinos-empty-state";
import { DaySection } from "./day-section";
import type { ActivityListItem, AssignmentWithDetails } from "./queries";
import { executionLinksOf, unmatchedActivities } from "./timeline";

export function WeekView({ monday, assignments, activities = [] }: { monday: Date; assignments: AssignmentWithDetails[]; activities?: ActivityListItem[] }) {
  const todayISO = toISODate(todayUTC());
  // SAM-41 — imports nobody matched, shown as "Não planejada" on their day.
  const unmatched = unmatchedActivities(executionLinksOf(assignments), activities);

  const days = Array.from({ length: 7 }, (_, offset) => {
    const d = addDaysUTC(monday, offset);
    const isoDate = toISODate(d);
    return {
      isoDate,
      label: DAY_NAMES[d.getUTCDay()],
      short: DAY_SHORT[d.getUTCDay()],
      dateLabel: fmtDay(d),
      isToday: isoDate === todayISO,
      isPast: isoDate < todayISO,
      isFuture: isoDate > todayISO,
      items: assignments.filter((a) => a.scheduledAt && toISODate(a.scheduledAt) === isoDate),
      activities: unmatched.filter((activity) => toISODate(activity.startedAt) === isoDate),
    };
  });

  const totalWorkouts = assignments.length;
  const completedCount = assignments.filter((a) => ["COMPLETED", "PARTIALLY_COMPLETED"].includes(a.status)).length;
  const missedCount = assignments.filter((a) => a.status === "MISSED").length;
  const isCurrentWeek = days.some((d) => d.isToday);

  return (
    <div className="space-y-5">
      {(totalWorkouts > 0 || unmatched.length > 0) && (
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
          {unmatched.length > 0 && (
            <span className="rounded-full bg-indigo-400/12 px-3 py-1 text-indigo-300 font-medium" data-testid="week-unplanned-count">
              {unmatched.length} não planejada{unmatched.length !== 1 ? "s" : ""}
            </span>
          )}
          {isCurrentWeek && totalWorkouts - completedCount - missedCount > 0 && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary/80">
              {totalWorkouts - completedCount - missedCount} restante{totalWorkouts - completedCount - missedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {days.map((day) => (
          <DaySection
            key={day.isoDate}
            label={day.label}
            dateLabel={day.dateLabel}
            isToday={day.isToday}
            isPast={day.isPast}
            isFuture={day.isFuture}
            items={day.items}
            activities={day.activities}
          />
        ))}
      </div>

      {totalWorkouts === 0 && unmatched.length === 0 && (
        <TreinosEmptyState
          title="Nenhum treino agendado nesta semana."
          description="Os treinos aparecem aqui quando seu professor ou escola os agendarem."
        />
      )}
    </div>
  );
}
