/**
 * SAM-30 — the one shape both athlete-side workout detail pages read: the
 * school-scoped `/atleta/[schoolId]/treinos/[assignmentId]` and the
 * school-less `/app/treinos/[assignmentId]` (independent coaching). Keeping the
 * `include` here means the two screens cannot drift apart in what they load.
 */
import type { Prisma } from "@prisma/client";

export const ATHLETE_WORKOUT_DETAIL_INCLUDE = {
  workout: {
    include: {
      blocks: {
        orderBy: { position: "asc" },
        select: {
          id: true, blockType: true, title: true,
          durationS: true, distanceM: true, repetitions: true,
          targetPayload: true, restPayload: true,
        },
      },
    },
  },
  executions: {
    where: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } },
    include: {
      compliance: true,
      feedback: true,
      evaluations: {
        where: { isVisible: true },
        select: { overallScore: true, note: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  },
  coach: { include: { user: { select: { name: true } } } },
  // SAM-16 — the scheduled time reads in the school's zone, the same clock the coach typed it in.
  school: { select: { timezone: true } },
  // SAM-27 — what the athlete already asked for, so the screen never offers it twice.
  changeRequests: {
    where: { status: { in: ["PENDING", "ACKNOWLEDGED"] } },
    select: { status: true, reason: true },
    take: 1,
  },
  comments: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true, kind: true, body: true, createdAt: true, resolvedAt: true,
      author: { select: { id: true, name: true, image: true } },
    },
  },
} satisfies Prisma.WorkoutAssignmentInclude;

export type AthleteWorkoutDetail = Prisma.WorkoutAssignmentGetPayload<{
  include: typeof ATHLETE_WORKOUT_DETAIL_INCLUDE;
}>;
