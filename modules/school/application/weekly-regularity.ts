/**
 * SAM-63 — the week as the coach reads it (§17.4, §16.7, AC12): the four
 * regularity groups with what stays outside the denominator, and the weekly
 * sRPE load when the organization chose that method. Calendar week Monday →
 * Sunday in the context's zone. The caller authorizes and passes the scope.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { combineExecutions } from "../domain/execution-combination";
import { deriveExecutionState, type ExecutionState } from "../domain/execution-state";
import { addCalendarDays, localMidnightToUtc, mondayOnOrBefore, todayLocalDate, utcToLocalDateTime } from "../domain/local-date";
import { weeklyRegularity } from "../domain/weekly-regularity";
import { sessionRpeLoad } from "../presentation/session-comparison";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";
import { loadFollowUpPolicy } from "./follow-up-reminders";

export async function loadWeeklyRegularity(
  db: PrismaClient,
  input: {
    athleteId: string;
    /** Exactly the prescription scope of the reader (school, or independent coach). */
    scope: Prisma.WorkoutAssignmentWhereInput;
    owner: { schoolId: string | null; coachId: string | null };
    timeZone: string;
    now: Date;
  },
) {
  const weekStartLocal = mondayOnOrBefore(todayLocalDate(input.now, input.timeZone));
  const weekEndLocal = addCalendarDays(weekStartLocal, 6);
  const [assignments, unavailability, policy] = await Promise.all([
    db.workoutAssignment.findMany({
      where: {
        athleteId: input.athleteId, ...input.scope,
        scheduledAt: { gte: localMidnightToUtc(weekStartLocal, input.timeZone), lt: localMidnightToUtc(addCalendarDays(weekStartLocal, 7), input.timeZone) },
      },
      select: {
        id: true, status: true, scheduledAt: true,
        workout: { select: { sportType: true } },
        executions: { where: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, select: { id: true, startedAt: true, durationSeconds: true, distanceMeters: true } },
      },
    }),
    db.athleteUnavailability.findMany({
      where: { athleteId: input.athleteId, startLocalDate: { lte: weekEndLocal }, endLocalDate: { gte: weekStartLocal } },
      select: { startLocalDate: true, endLocalDate: true },
    }),
    loadFollowUpPolicy(db, { schoolId: input.owner.schoolId, coachId: input.owner.schoolId ? null : input.owner.coachId }),
  ]);
  const feedbacks = assignments.length === 0 ? [] : await db.athleteFeedback.findMany({
    where: { workoutAssignmentId: { in: assignments.map((assignment) => assignment.id) } },
    orderBy: { updatedAt: "desc" },
    select: { workoutAssignmentId: true, completion: true, rpe: true },
  });

  const sessions = assignments.map((assignment) => {
    const feedback = feedbacks.find((row) => row.workoutAssignmentId === assignment.id) ?? null;
    const day = assignment.scheduledAt ? utcToLocalDateTime(assignment.scheduledAt, input.timeZone).date : null;
    const unavailable = day !== null && unavailability.some((period) => period.startLocalDate <= day && day <= period.endLocalDate);
    const state: ExecutionState = deriveExecutionState({
      status: assignment.status, scheduledAt: assignment.scheduledAt, hasMatchedExecution: assignment.executions.length > 0,
      completion: (feedback?.completion ?? null) as "FULL" | "PARTIAL" | "NOT_DONE" | null, now: input.now,
      syncWindowHours: policy.syncWindowHours, sportType: assignment.workout?.sportType, unavailable,
    });
    const combined = combineExecutions(assignment.executions);
    return { state, rpe: feedback?.rpe ?? null, durationSeconds: combined?.durationSeconds ?? null };
  });

  const loads = sessions.map((session) => sessionRpeLoad(session.durationSeconds, session.rpe, policy.sessionLoadMethod));
  const computed = loads.filter((load): load is Extract<typeof load, { status: "computed" }> => load?.status === "computed");
  return {
    weekStartLocal,
    regularity: weeklyRegularity(sessions.map((session) => session.state)),
    load: policy.sessionLoadMethod === "SRPE"
      ? { method: "SRPE" as const, totalUA: computed.reduce((sum, load) => sum + load.value, 0), sessionsWithRpe: computed.length }
      : null,
  };
}
