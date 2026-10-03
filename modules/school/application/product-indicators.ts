/**
 * SAM-80 — reads the aggregates behind the seven product indicators for a
 * period, optionally scoped to one school (platform admin only; the route
 * guards the role). Nothing personal leaves this module: ids and names are
 * never returned, only counts and durations.
 */
import type { PrismaClient } from "@prisma/client";

import {
  catalogUsage, eventsClosed, extrasReviewed, followUpsCovered, importAndPublishFailures, timeToAssignBatch, timeToFirstAnalysis, type IndicatorView, type Period,
} from "../domain/product-indicators";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";

export async function loadProductIndicators(db: PrismaClient, period: Period, schoolId: string | null = null): Promise<{ period: Period; schoolId: string | null; indicators: IndicatorView[] }> {
  const inPeriod = { gte: period.from, lte: period.to };
  const school = schoolId ? { schoolId } : {};
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(period.to);

  const [preparations, batches, workouts, notices, duplicates, failedWebhooks, failedPushes, participations] = await Promise.all([
    db.eventPreparation.findMany({ where: { createdAt: inPeriod, ...school }, select: { createdAt: true, startedAt: true, status: true, coachId: true, firstReviewLocalDate: true } }),
    db.assignmentBatch.findMany({ where: { createdAt: inPeriod, ...school }, select: { createdAt: true, updatedAt: true, templateId: true, recipients: { select: { status: true, overrides: true } } } }),
    db.workout.findMany({ where: { createdAt: inPeriod, ...(schoolId ? { originSchoolId: schoolId } : {}) }, select: { templateId: true } }),
    db.userNotification.findMany({ where: { kind: "UNPLANNED_ACTIVITY", createdAt: inPeriod }, select: { dedupeKey: true } }),
    db.activity.count({ where: { createdAt: inPeriod, OR: [{ duplicateOfActivityId: { not: null } }, { parentActivityId: { not: null } }] } }),
    db.stravaWebhookEvent.count({ where: { receivedAt: inPeriod, processingStatus: "FAILED" } }).catch(() => 0),
    db.workoutAssignment.count({ where: { updatedAt: inPeriod, garminPushStatus: "FAILED", ...school } }),
    db.athleteEventParticipation.findMany({
      where: { event: { startLocalDate: { lte: today } }, createdAt: { lte: period.to }, status: { not: "CANCELLED" }, ...(schoolId ? { preparation: { schoolId } } : {}) },
      select: { result: { select: { status: true } }, preparation: { select: { reviews: { where: { targetType: "PREPARATION" }, select: { id: true }, take: 1 } } } },
    }),
  ]);

  // Unplanned notices → was the activity linked later, or reported by the athlete?
  const activityIds = notices.map((notice) => notice.dedupeKey?.replace(/^unplanned:/, "")).filter((id): id is string => Boolean(id));
  const [linked, reported] = activityIds.length === 0 ? [[], []] : await Promise.all([
    db.workoutExecution.findMany({ where: { activityId: { in: activityIds }, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, select: { activityId: true } }),
    db.athleteFeedback.findMany({ where: { activityId: { in: activityIds } }, select: { activityId: true } }),
  ]);
  const linkedIds = new Set(linked.map((row) => row.activityId));
  const reportedIds = new Set(reported.map((row) => row.activityId));
  const recipients = batches.flatMap((batch) => batch.recipients);

  return {
    period, schoolId,
    indicators: [
      timeToFirstAnalysis(preparations),
      followUpsCovered(preparations),
      timeToAssignBatch(batches),
      catalogUsage(workouts, batches),
      extrasReviewed(activityIds.map((id) => ({ noticed: true, linkedLater: linkedIds.has(id), reportedByAthlete: reportedIds.has(id) }))),
      importAndPublishFailures({
        duplicates, failedWebhooks, failedPushes,
        failedRecipients: recipients.filter((row) => row.status === "FAILED" || row.status === "BLOCKED").length,
        totalRecipients: recipients.length,
      }),
      eventsClosed(participations.map((row) => ({ eventPassed: true, hasResult: row.result !== null && row.result.status !== "PENDING", hasReview: (row.preparation?.reviews.length ?? 0) > 0 }))),
    ],
  };
}
