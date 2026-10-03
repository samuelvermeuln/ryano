import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import type { DateRange } from "./date-helpers";

// ---------------------------------------------------------------------------
// WorkoutAssignment — full detail (day / week / list views)
// ---------------------------------------------------------------------------

const ASSIGNMENT_INCLUDE = {
  workout: {
    include: {
      blocks: {
        select: {
          blockType: true,
          durationS: true,
          distanceM: true,
          repetitions: true,
          targetPayload: true,
          restPayload: true,
        },
        orderBy: { position: "asc" },
      },
    },
  },
  workoutTemplate: { select: { title: true, sportType: true } },
  school: { select: { id: true, name: true, slug: true } },
  coach: { select: { id: true, displayName: true } },
  // TM045 (RF-110) — marketplace provenance: when set, this assignment came
  // from a purchased plan's calendar instantiation, not a school prescription.
  trainingLicense: {
    select: {
      id: true,
      product: {
        select: {
          title: true,
          coach: { select: { displayName: true } },
          school: { select: { name: true } },
        },
      },
    },
  },
  executions: {
    where: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } },
    select: {
      id: true,
      // SAM-41 — the link to the imported activity, so the calendar never shows
      // the same session twice (prescription card + "unplanned" activity card).
      activityId: true,
      source: true,
      externalId: true,
      durationSeconds: true,
      movingSeconds: true,
      distanceMeters: true,
      averageHeartRate: true,
      averageSpeed: true,
      elevationGain: true,
      sportType: true,
    },
    take: 1,
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.WorkoutAssignmentInclude;

export type AssignmentWithDetails = Prisma.WorkoutAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

/** SAM-57 — `sport` narrows every view to one canonical modality (the prescription's snapshot sport). */
export async function getAssignmentsInRange(athleteId: string, range: DateRange, sport: string | null = null): Promise<AssignmentWithDetails[]> {
  return prisma.workoutAssignment.findMany({
    where: {
      athleteId,
      status: { notIn: ["CANCELLED"] },
      scheduledAt: { gte: range.start, lte: range.end },
      ...(sport ? { workout: { sportType: sport } } : {}),
    },
    include: ASSIGNMENT_INCLUDE,
    orderBy: { scheduledAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// WorkoutAssignment — lightweight summary (month / year views: only enough
// to draw per-day indicators, never the heavy includes above)
// ---------------------------------------------------------------------------

const ASSIGNMENT_SUMMARY_SELECT = {
  id: true,
  scheduledAt: true,
  status: true,
} satisfies Prisma.WorkoutAssignmentSelect;

export type AssignmentSummary = Prisma.WorkoutAssignmentGetPayload<{ select: typeof ASSIGNMENT_SUMMARY_SELECT }>;

export async function getAssignmentSummariesInRange(athleteId: string, range: DateRange, sport: string | null = null): Promise<AssignmentSummary[]> {
  return prisma.workoutAssignment.findMany({
    where: {
      athleteId,
      status: { notIn: ["CANCELLED"] },
      scheduledAt: { gte: range.start, lte: range.end },
      ...(sport ? { workout: { sportType: sport } } : {}),
    },
    select: ASSIGNMENT_SUMMARY_SELECT,
    orderBy: { scheduledAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Activity — real executed activities (every view, SAM-41: an imported
// activity nobody matched is shown as "Não planejada" beside the day's
// prescriptions; a matched one is already represented by its prescription)
// ---------------------------------------------------------------------------

const ACTIVITY_LIST_SELECT = {
  id: true,
  sportType: true,
  name: true,
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  provider: true,
  externalId: true,
} satisfies Prisma.ActivitySelect;

export type ActivityListItem = Prisma.ActivityGetPayload<{ select: typeof ACTIVITY_LIST_SELECT }>;

export async function getActivitiesInRange(userId: string, range: DateRange, sport: string | null = null): Promise<ActivityListItem[]> {
  return prisma.activity.findMany({
    where: {
      userId,
      startedAt: { gte: range.start, lte: range.end },
      ...(sport ? { sportType: sport } : {}),
      // SAM-39 — a mirror of a session from another connection is shown once.
      duplicateOfActivityId: null, parentActivityId: null,
    },
    select: ACTIVITY_LIST_SELECT,
    orderBy: { startedAt: "asc" },
  });
}

/** Month view indicator: only the day of each unmatched import is needed. */
export type ActivitySummary = Pick<ActivityListItem, "id" | "startedAt" | "provider" | "externalId">;

/** Matched executions of the month, to tell an unplanned import from a matched one without the heavy includes. */
export async function getMatchedExecutionLinksInRange(athleteId: string, range: DateRange) {
  return prisma.workoutExecution.findMany({
    where: {
      athleteId,
      matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] },
      startedAt: { gte: range.start, lte: range.end },
    },
    select: { activityId: true, source: true, externalId: true },
  });
}
