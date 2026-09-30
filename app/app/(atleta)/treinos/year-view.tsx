import Link from "next/link";

import { MONTH_NAMES, STATUS_CONFIG } from "./constants";
import { getMonthGridDays, monthParam, toISODate, todayUTC } from "./date-helpers";
import type { AssignmentSummary } from "./queries";

/** One dominant color per day cell: missed beats everything (needs attention),
 *  then completed, then anything scheduled/pending. Kept intentionally simple —
 *  this is a heatmap, not a place to read individual workout status from. */
function dominantDotClass(dayItems: AssignmentSummary[]): string | null {
  if (dayItems.length === 0) return null;
  if (dayItems.some((i) => i.status === "MISSED")) return STATUS_CONFIG.MISSED!.dot;
  if (dayItems.some((i) => ["COMPLETED", "PARTIALLY_COMPLETED"].includes(i.status))) return STATUS_CONFIG.COMPLETED!.dot;
  return STATUS_CONFIG.SCHEDULED!.dot;
}

function MiniMonth({ monthStart, itemsByDay }: { monthStart: Date; itemsByDay: Map<string, AssignmentSummary[]> }) {
  const gridDays = getMonthGridDays(monthStart);
  const todayISO = toISODate(todayUTC());
  const currentMonth = monthStart.getUTCMonth();

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-3 space-y-2">
      <Link
        href={`?view=month&month=${monthParam(monthStart)}`}
        className="text-xs font-semibold text-foreground/70 hover:text-foreground transition-colors"
      >
        {MONTH_NAMES[monthStart.getUTCMonth()]}
      </Link>
      <div className="grid grid-cols-7 gap-[3px]">
        {gridDays.map((day) => {
          const isoDate = toISODate(day);
          const inMonth = day.getUTCMonth() === currentMonth;
          const isToday = isoDate === todayISO;
          const dotClass = dominantDotClass(itemsByDay.get(isoDate) ?? []);

          return (
            <Link
              key={isoDate}
              href={`?view=day&date=${isoDate}`}
              title={isoDate}
              className={[
                "aspect-square rounded-[3px] transition-opacity hover:opacity-70",
                isToday ? "ring-1 ring-primary" : "",
                inMonth ? "" : "opacity-20",
                dotClass ?? "bg-white/6",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}

export function YearView({ yearStart, assignments }: { yearStart: Date; assignments: AssignmentSummary[] }) {
  const itemsByDay = new Map<string, AssignmentSummary[]>();
  for (const assignment of assignments) {
    if (!assignment.scheduledAt) continue;
    const isoDate = toISODate(assignment.scheduledAt);
    const bucket = itemsByDay.get(isoDate);
    if (bucket) bucket.push(assignment);
    else itemsByDay.set(isoDate, [assignment]);
  }

  const year = yearStart.getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {months.map((monthStart) => (
        <MiniMonth key={monthStart.getUTCMonth()} monthStart={monthStart} itemsByDay={itemsByDay} />
      ))}
    </div>
  );
}
