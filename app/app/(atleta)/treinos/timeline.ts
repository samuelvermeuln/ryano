/**
 * Pure merge/grouping logic for the athlete's calendar. WorkoutAssignment
 * (prescribed) and Activity (actually executed) are NOT joined together —
 * they are interleaved by date and tagged with a discriminant so the views
 * pick the right card.
 *
 * SAM-41 — an imported activity that a matched execution already represents
 * (the prescription card shows it as done) is dropped from the activity side,
 * so the same session never appears twice; what remains is "Não planejada".
 * The rule is the shared one of `modules/school/application/unplanned-activities`.
 */
import { splitLinkedActivities, type ExecutionLink } from "@/modules/school/application/unplanned-activities";
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

/** Imports no matched execution claims — the ones to show as "Não planejada". */
export function unmatchedActivities<T extends { id: string; provider: string; externalId: string }>(
  executions: readonly ExecutionLink[],
  activities: readonly T[],
): T[] {
  return splitLinkedActivities(executions, activities).unlinked;
}

/** The matched executions carried by the prescriptions of a range. */
export function executionLinksOf(assignments: readonly AssignmentWithDetails[]): ExecutionLink[] {
  return assignments.flatMap((assignment) => assignment.executions.map((execution) => ({
    activityId: execution.activityId,
    source: execution.source,
    externalId: execution.externalId,
  })));
}

/** Assignments passed in are always pre-filtered to a range with scheduledAt
 *  set (see getAssignmentsInRange), so the non-null assertion below is safe. */
export function mergeTimelineItems(
  assignments: AssignmentWithDetails[],
  activities: ActivityListItem[],
): TimelineItem[] {
  const unmatched = unmatchedActivities(executionLinksOf(assignments), activities);
  const items: TimelineItem[] = [
    ...assignments.map((data): TimelineItem => ({ kind: "assignment", sortDate: data.scheduledAt!, data })),
    ...unmatched.map((data): TimelineItem => ({ kind: "activity", sortDate: data.startedAt, data })),
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
