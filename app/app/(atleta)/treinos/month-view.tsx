import Link from "next/link";

import { DAY_SHORT, STATUS_CONFIG } from "./constants";
import { getMonthGridDays, toISODate, todayUTC } from "./date-helpers";
import type { AssignmentSummary } from "./queries";

const MAX_DOTS_PER_CELL = 3;

export function MonthView({
  monthStart,
  assignments,
}: {
  monthStart: Date;
  assignments: AssignmentSummary[];
}) {
  const gridDays = getMonthGridDays(monthStart);
  const todayISO = toISODate(todayUTC());
  const currentMonth = monthStart.getUTCMonth();

  const itemsByDay = new Map<string, AssignmentSummary[]>();
  for (const assignment of assignments) {
    if (!assignment.scheduledAt) continue;
    const isoDate = toISODate(assignment.scheduledAt);
    const bucket = itemsByDay.get(isoDate);
    if (bucket) bucket.push(assignment);
    else itemsByDay.set(isoDate, [assignment]);
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
              {dayItems.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {dayItems.slice(0, MAX_DOTS_PER_CELL).map((item) => (
                    <span
                      key={item.id}
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[item.status]?.dot ?? "bg-foreground/20"}`}
                    />
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
