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
        },
        orderBy: { position: "asc" },
      },
    },
  },
  workoutTemplate: { select: { title: true, sportType: true } },
  school: { select: { id: true, name: true, slug: true } },
  coach: { select: { id: true, displayName: true } },
  executions: {
    where: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } },
    select: {
      id: true,
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

export async function getAssignmentsInRange(athleteId: string, range: DateRange): Promise<AssignmentWithDetails[]> {
  return prisma.workoutAssignment.findMany({
    where: {
      athleteId,
      status: { notIn: ["CANCELLED"] },
      scheduledAt: { gte: range.start, lte: range.end },
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

export async function getAssignmentSummariesInRange(athleteId: string, range: DateRange): Promise<AssignmentSummary[]> {
  return prisma.workoutAssignment.findMany({
    where: {
      athleteId,
      status: { notIn: ["CANCELLED"] },
      scheduledAt: { gte: range.start, lte: range.end },
    },
    select: ASSIGNMENT_SUMMARY_SELECT,
    orderBy: { scheduledAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Activity — real executed activities (list view only)
// ---------------------------------------------------------------------------

const ACTIVITY_LIST_SELECT = {
  id: true,
  sportType: true,
  name: true,
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  provider: true,
} satisfies Prisma.ActivitySelect;

export type ActivityListItem = Prisma.ActivityGetPayload<{ select: typeof ACTIVITY_LIST_SELECT }>;

export async function getActivitiesInRange(userId: string, range: DateRange): Promise<ActivityListItem[]> {
  return prisma.activity.findMany({
    where: {
      userId,
      startedAt: { gte: range.start, lte: range.end },
    },
    select: ACTIVITY_LIST_SELECT,
    orderBy: { startedAt: "asc" },
  });
}
