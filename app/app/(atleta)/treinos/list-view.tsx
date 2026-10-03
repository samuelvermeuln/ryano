import { mergeTimelineItems, groupTimelineByDay } from "./timeline";
import { TreinosEmptyState } from "./treinos-empty-state";
import { WorkoutCard } from "./workout-card";
import { ActivityCard } from "./activity-card";
import { EventCard, UnavailabilityCard } from "./calendar-extra-cards";
import { NO_EXTRAS, type CalendarExtras } from "./calendar-extras";
import type { AssignmentWithDetails, ActivityListItem } from "./queries";

function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
}

export function ListView({
  assignments,
  activities,
  extras = NO_EXTRAS,
}: {
  assignments: AssignmentWithDetails[];
  activities: ActivityListItem[];
  /** SAM-57 — events on their start day, unavailability on its first day. */
  extras?: CalendarExtras;
}) {
  const groups = groupTimelineByDay(mergeTimelineItems(assignments, activities));
  const days = new Map(groups.map((group) => [group.isoDate, { label: group.label, items: group.items, events: [] as CalendarExtras["events"], periods: [] as CalendarExtras["unavailabilities"] }]));
  const dayOf = (isoDate: string) => {
    const existing = days.get(isoDate);
    if (existing) return existing;
    const created = { label: dayLabel(isoDate), items: [] as typeof groups[number]["items"], events: [] as CalendarExtras["events"], periods: [] as CalendarExtras["unavailabilities"] };
    days.set(isoDate, created);
    return created;
  };
  for (const event of extras.events) dayOf(event.startLocalDate).events.push(event);
  for (const period of extras.unavailabilities) dayOf(period.startLocalDate).periods.push(period);
  const ordered = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (ordered.length === 0) {
    return (
      <TreinosEmptyState
        title="Nada por aqui neste mês."
        description="Treinos prescritos, atividades, eventos e indisponibilidades aparecem juntos aqui, em ordem cronológica."
      />
    );
  }

  return (
    <div className="space-y-4">
      {ordered.map(([isoDate, group]) => (
        <div key={isoDate} className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-foreground/40">{group.label}</p>
          <div className="space-y-2">
            {group.events.map((event) => <EventCard key={`e-${event.participationId}`} event={event} />)}
            {group.periods.map((period) => <UnavailabilityCard key={`u-${period.id}`} period={period} />)}
            {group.items.map((item) =>
              item.kind === "assignment" ? (
                <WorkoutCard key={`a-${item.data.id}`} assignment={item.data} />
              ) : (
                <ActivityCard key={`c-${item.data.id}`} activity={item.data} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
