/**
 * Pure merge/grouping logic for the unified list view. WorkoutAssignment
 * (prescribed) and Activity (actually executed) are NOT joined together —
 * there is no FK between them today — they are only interleaved by date and
 * tagged with a discriminant so list-view.tsx can pick the right card.
 */
import type { AssignmentWithDetails, ActivityListItem } from "./queries";
import { fmtDay, toISODate } from "./date-helpers";

export type TimelineItem =
  | { kind: "assignment"; sortDate: Date; data: AssignmentWithDetails }
  | { kind: "activity"; sortDate: Date; data: ActivityListItem };

export type TimelineDayGroup = {
  isoDate: string;
  label: string;
  items: TimelineItem[];
};

/** Assignments passed in are always pre-filtered to a range with scheduledAt
 *  set (see getAssignmentsInRange), so the non-null assertion below is safe. */
export function mergeTimelineItems(
  assignments: AssignmentWithDetails[],
  activities: ActivityListItem[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...assignments.map((data): TimelineItem => ({ kind: "assignment", sortDate: data.scheduledAt!, data })),
    ...activities.map((data): TimelineItem => ({ kind: "activity", sortDate: data.startedAt, data })),
  ];

  return items.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
}

export function groupTimelineByDay(items: TimelineItem[]): TimelineDayGroup[] {
  const groups: TimelineDayGroup[] = [];
  const byDate = new Map<string, TimelineDayGroup>();

  for (const item of items) {
    const isoDate = toISODate(item.sortDate);
    let group = byDate.get(isoDate);
    if (!group) {
      group = { isoDate, label: fmtDay(item.sortDate), items: [] };
      byDate.set(isoDate, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}
