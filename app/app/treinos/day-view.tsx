import { DAY_NAMES } from "./constants";
import { fmtDay, toISODate, todayUTC } from "./date-helpers";
import { DaySection } from "./day-section";
import type { AssignmentWithDetails } from "./queries";

export function DayView({ day, assignments }: { day: Date; assignments: AssignmentWithDetails[] }) {
  const isoDate = toISODate(day);
  const todayISO = toISODate(todayUTC());

  return (
    <DaySection
      label={DAY_NAMES[day.getUTCDay()]}
      dateLabel={fmtDay(day)}
      isToday={isoDate === todayISO}
      isPast={isoDate < todayISO}
      isFuture={isoDate > todayISO}
      items={assignments}
    />
  );
}
