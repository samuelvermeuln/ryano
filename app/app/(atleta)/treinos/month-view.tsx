import Link from "next/link";

import { ACTIVITY_ACCENT, DAY_SHORT, STATUS_CONFIG } from "./constants";
import { getMonthGridDays, toISODate, todayUTC } from "./date-helpers";
import type { ActivitySummary, AssignmentSummary } from "./queries";
import { EVENT_ACCENT, UNAVAILABLE_ACCENT } from "./calendar-extra-cards";
import { extrasOnDay, NO_EXTRAS, type CalendarExtras } from "./calendar-extras";

const MAX_DOTS_PER_CELL = 3;

type DayDot = { id: string; dot: string };

export function MonthView({
  monthStart,
  assignments,
  unplannedActivities = [],
  extras = NO_EXTRAS,
}: {
  monthStart: Date;
  assignments: AssignmentSummary[];
  /** SAM-41 — imports no prescription claims, already de-duplicated: one indigo dot each. */
  unplannedActivities?: ActivitySummary[];
  /** SAM-57 — events and unavailability, marked with their own glyph (not color alone). */
  extras?: CalendarExtras;
}) {
  const gridDays = getMonthGridDays(monthStart);
  const todayISO = toISODate(todayUTC());
  const currentMonth = monthStart.getUTCMonth();

  const itemsByDay = new Map<string, DayDot[]>();
  const push = (isoDate: string, dot: DayDot) => {
    const bucket = itemsByDay.get(isoDate);
    if (bucket) bucket.push(dot);
    else itemsByDay.set(isoDate, [dot]);
  };
  for (const assignment of assignments) {
    if (!assignment.scheduledAt) continue;
    push(toISODate(assignment.scheduledAt), { id: assignment.id, dot: STATUS_CONFIG[assignment.status]?.dot ?? "bg-foreground/20" });
  }
  for (const activity of unplannedActivities) {
    push(toISODate(activity.startedAt), { id: `act-${activity.id}`, dot: ACTIVITY_ACCENT.dot });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-foreground/40">
        {DAY_SHORT.slice(1).concat(DAY_SHORT[0]!).map((short) => (
          <span key={short}>{short}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((day) => {
          const isoDate = toISODate(day);
          const inMonth = day.getUTCMonth() === currentMonth;
          const isToday = isoDate === todayISO;
          const dayItems = itemsByDay.get(isoDate) ?? [];
          const dayExtras = extrasOnDay(extras, isoDate);

          return (
            <Link
              key={isoDate}
              href={`?view=day&date=${isoDate}`}
              className={[
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 min-h-[56px] transition-colors hover:bg-white/6",
                isToday ? "border-primary/40 bg-primary/8" : "border-white/8",
                inMonth ? "" : "opacity-30",
              ].join(" ")}
            >
              <span className={`text-xs ${isToday ? "font-bold text-primary" : "text-foreground/70"}`}>
                {day.getUTCDate()}
              </span>
              {(dayExtras.events.length > 0 || dayExtras.unavailabilities.length > 0) && (
                <div className="flex items-center gap-0.5 text-[10px] leading-none">
                  {dayExtras.events.length > 0 && (
                    <span className={EVENT_ACCENT.text} title={dayExtras.events.map((event) => event.name).join(", ")} data-testid="month-event">
                      <span aria-hidden="true">🏁</span><span className="sr-only">Evento: {dayExtras.events.map((event) => event.name).join(", ")}</span>
                    </span>
                  )}
                  {dayExtras.unavailabilities.length > 0 && (
                    <span className={`inline-block h-1.5 w-3 rounded-sm ${UNAVAILABLE_ACCENT.dot}`} title="Indisponível" data-testid="month-unavailable">
                      <span className="sr-only">Indisponível</span>
                    </span>
                  )}
                </div>
              )}
              {dayItems.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {dayItems.slice(0, MAX_DOTS_PER_CELL).map((item) => (
                    <span key={item.id} className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                  ))}
                  {dayItems.length > MAX_DOTS_PER_CELL && (
                    <span className="text-[9px] text-foreground/35 ml-0.5">+{dayItems.length - MAX_DOTS_PER_CELL}</span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
