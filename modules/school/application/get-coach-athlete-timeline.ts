/**
 * The interaction trail between coach and athlete, merged into one chronology:
 * prescription events (assigned, rescheduled, cancelled…), revision requests and
 * their answers, coach evaluations, and the athlete's own post-workout feedback.
 *
 * Consent, not convenience, decides what is in it (ADR-005):
 *
 * - prescription events, revision requests and the coach's own evaluations are
 *   the school's own record of its work and need no grant;
 * - the athlete's **feedback** (RPE and comments) is the `athleteFeedback`
 *   consent category. Each candidate entry is checked against
 *   `CanReadAthleteHistory` at its own date, because a grant may cover part of a
 *   period only. Entries outside the grant are counted, not shown, so the screen
 *   can say "N registros de feedback dependem de autorização do atleta" instead
 *   of presenting a shorter history as if it were the whole one.
 *
 * Every source is read inside the athlete's current membership period; a
 * previous stay is a different consent question.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { CanReadAthleteHistory } from "./can-read-athlete-history";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** SAM-20 — opaque `${occurredAt ISO}|${entry id}` of the last entry shown; the page after it is returned. */
  cursor: z.string().min(1).max(400).optional(),
});

export type TimelineCursor = { occurredAt: Date; id: string };

export function encodeTimelineCursor(entry: { occurredAt: Date; id: string }): string {
  return `${entry.occurredAt.toISOString()}|${entry.id}`;
}

export function decodeTimelineCursor(value: string | undefined): TimelineCursor | null {
  if (!value) return null;
  const separator = value.indexOf("|");
  if (separator <= 0) return null;
  const occurredAt = new Date(value.slice(0, separator));
  const id = value.slice(separator + 1);
  return Number.isNaN(occurredAt.getTime()) || id.length === 0 ? null : { occurredAt, id };
}

/** Chronological order, newest first, with the entry id as the stable tie-breaker. */
function compareEntries(a: { occurredAt: Date; id: string }, b: { occurredAt: Date; id: string }): number {
  const byDate = b.occurredAt.getTime() - a.occurredAt.getTime();
  return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
}

export type TimelineEntryKind =
  | "assignment-event"
  | "change-request"
  | "change-resolution"
  | "evaluation"
  | "feedback";

export type TimelineEntry = {
  id: string;
  kind: TimelineEntryKind;
  occurredAt: Date;
  /** Prescription this entry is about, so the screen can link to its detail. */
  assignmentId: string;
  workoutTitle: string;
  /** Who produced the entry; null for system-initiated events. */
  actorName: string | null;
  /** Short machine-readable subject (event type, request status, score…). */
  subject: string;
  /** Free text the person wrote, when there is any. */
  note: string | null;
};

export class GetCoachAthleteTimeline {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, raw: unknown = {}) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, schoolId, athleteId);
    const { limit, cursor: rawCursor } = querySchema.parse(raw);
    const cursor = decodeTimelineCursor(rawCursor);
    // Each source is read from the cursor's instant down; the exact
    // (occurredAt, id) boundary is applied after the merge. Reading `limit + 1`
    // per source is enough to know whether a next page exists.
    const take = limit + 1;
    const notAfterCursor = cursor ? { lte: cursor.occurredAt } : undefined;

    const assignmentScope = {
      athleteId,
      schoolId: context.schoolId,
      createdAt: { gte: context.periodStart },
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
    } as const;

    const [events, changeRequests, evaluations, feedbacks] = await Promise.all([
      this.db.workoutAssignmentHistory.findMany({
        where: { workoutAssignment: assignmentScope, ...(notAfterCursor ? { createdAt: notAfterCursor } : {}) },
        select: {
          id: true, eventType: true, createdAt: true, workoutAssignmentId: true,
          actor: { select: { name: true, email: true } },
          workoutAssignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
      }),
      this.db.workoutChangeRequest.findMany({
        // A resolution never precedes its request, so bounding `createdAt` also bounds the resolution entry.
        where: { schoolId: context.schoolId, workoutAssignment: assignmentScope, ...(notAfterCursor ? { createdAt: notAfterCursor } : {}) },
        select: {
          id: true, status: true, reason: true, resolutionNote: true,
          createdAt: true, resolvedAt: true, workoutAssignmentId: true,
          requester: { select: { name: true, email: true } },
          resolver: { select: { name: true, email: true } },
          workoutAssignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
      }),
      this.db.coachEvaluation.findMany({
        where: { athleteId, schoolId: context.schoolId, assignment: assignmentScope, ...(notAfterCursor ? { createdAt: notAfterCursor } : {}) },
        select: {
          id: true, overallScore: true, note: true, createdAt: true, workoutAssignmentId: true,
          coach: { select: { displayName: true, user: { select: { name: true } } } },
          assignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
      }),
      this.db.athleteFeedback.findMany({
        // Feedback is dated at its session, so it is read and bounded by the
        // execution's start, the same instant the merged order uses.
        where: { athleteId, assignment: assignmentScope, ...(notAfterCursor ? { execution: { startedAt: notAfterCursor } } : {}) },
        select: {
          id: true, rpe: true, mood: true, energy: true, comment: true,
          createdAt: true, workoutAssignmentId: true,
          execution: { select: { startedAt: true } },
          assignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ execution: { startedAt: "desc" } }, { id: "desc" }],
        take,
      }),
    ]);

    const title = (row: { sourceLabel: string | null; workout: { title: string } | null } | null) =>
      row?.workout?.title ?? row?.sourceLabel ?? "Treino agendado";
    const person = (row: { name: string | null; email: string | null } | null) =>
      row?.name ?? row?.email ?? null;

    const entries: TimelineEntry[] = [
      ...events.map((event) => ({
        id: `event:${event.id}`,
        kind: "assignment-event" as const,
        occurredAt: event.createdAt,
        assignmentId: event.workoutAssignmentId,
        workoutTitle: title(event.workoutAssignment),
        actorName: person(event.actor),
        subject: event.eventType,
        note: null,
      })),
      ...changeRequests.map((request) => ({
        id: `change:${request.id}`,
        kind: "change-request" as const,
        occurredAt: request.createdAt,
        assignmentId: request.workoutAssignmentId,
        workoutTitle: title(request.workoutAssignment),
        actorName: person(request.requester),
        subject: request.status,
        note: request.reason,
      })),
      // A resolved request is two moments, not one: the ask and the answer.
      ...changeRequests
        .filter((request) => request.resolvedAt !== null)
        .map((request) => ({
          id: `change-resolution:${request.id}`,
          kind: "change-resolution" as const,
          occurredAt: request.resolvedAt!,
          assignmentId: request.workoutAssignmentId,
          workoutTitle: title(request.workoutAssignment),
          actorName: person(request.resolver),
          subject: request.status,
          note: request.resolutionNote,
        })),
      ...evaluations.map((evaluation) => ({
        id: `evaluation:${evaluation.id}`,
        kind: "evaluation" as const,
        occurredAt: evaluation.createdAt,
        assignmentId: evaluation.workoutAssignmentId,
        workoutTitle: title(evaluation.assignment),
        actorName: evaluation.coach.displayName ?? evaluation.coach.user?.name ?? "Professor",
        subject: String(evaluation.overallScore),
        note: evaluation.note,
      })),
    ];

    // SAM-20 — consent resolved once for the whole page (bounded queries),
    // then answered per entry in memory; the decision is `CanReadAthleteHistory`'s.
    const mayReadFeedbackAt = feedbacks.length > 0
      ? await new CanReadAthleteHistory(this.db, this.clock).resolver(actorUserId, {
        athleteId, schoolId: context.schoolId, category: "athleteFeedback",
      })
      : () => false;
    let feedbackWithheld = 0;
    for (const feedback of feedbacks) {
      // Dated at the session it refers to, not at the moment it was typed: a
      // grant bounded by dates is about the period the training happened in.
      const occurredAt = feedback.execution?.startedAt ?? feedback.createdAt;
      if (!mayReadFeedbackAt(occurredAt)) {
        feedbackWithheld += 1;
        continue;
      }
      entries.push({
        id: `feedback:${feedback.id}`,
        kind: "feedback",
        occurredAt,
        assignmentId: feedback.workoutAssignmentId,
        workoutTitle: title(feedback.assignment),
        actorName: context.athlete.name ?? context.athlete.email ?? "Atleta",
        subject: `RPE ${feedback.rpe}`,
        note: feedback.comment,
      });
    }

    entries.sort(compareEntries);
    // Strictly after the cursor in the merged order (the per-source bound was
    // only `<=` on the instant).
    const page = cursor ? entries.filter((entry) => compareEntries(entry, cursor) > 0) : entries;
    const shown = page.slice(0, limit);
    const last = shown[shown.length - 1];

    return {
      context,
      entries: shown,
      hasMore: page.length > limit,
      /** SAM-20 — pass back as `cursor` to read the next page. */
      nextCursor: page.length > limit && last ? encodeTimelineCursor(last) : null,
      limit,
      feedbackWithheld,
    };
  }
}
