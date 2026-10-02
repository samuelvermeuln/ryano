import { DAY_NAMES } from "./constants";
import { fmtDay, toISODate, todayUTC } from "./date-helpers";
import { DaySection } from "./day-section";
import type { ActivityListItem, AssignmentWithDetails } from "./queries";
import { executionLinksOf, unmatchedActivities } from "./timeline";

export function DayView({ day, assignments, activities = [] }: { day: Date; assignments: AssignmentWithDetails[]; activities?: ActivityListItem[] }) {
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
      activities={unmatchedActivities(executionLinksOf(assignments), activities)}
    />
  );
}
