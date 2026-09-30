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
});

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
    const { limit } = querySchema.parse(raw);

    const assignmentScope = {
      athleteId,
      schoolId: context.schoolId,
      createdAt: { gte: context.periodStart },
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
    } as const;

    const [events, changeRequests, evaluations, feedbacks] = await Promise.all([
      this.db.workoutAssignmentHistory.findMany({
        where: { workoutAssignment: assignmentScope },
        select: {
          id: true, eventType: true, createdAt: true, workoutAssignmentId: true,
          actor: { select: { name: true, email: true } },
          workoutAssignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      this.db.workoutChangeRequest.findMany({
        where: { schoolId: context.schoolId, workoutAssignment: assignmentScope },
        select: {
          id: true, status: true, reason: true, resolutionNote: true,
          createdAt: true, resolvedAt: true, workoutAssignmentId: true,
          requester: { select: { name: true, email: true } },
          resolver: { select: { name: true, email: true } },
          workoutAssignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      this.db.coachEvaluation.findMany({
        where: { athleteId, schoolId: context.schoolId, assignment: assignmentScope },
        select: {
          id: true, overallScore: true, note: true, createdAt: true, workoutAssignmentId: true,
          coach: { select: { displayName: true, user: { select: { name: true } } } },
          assignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      this.db.athleteFeedback.findMany({
        where: { athleteId, assignment: assignmentScope },
        select: {
          id: true, rpe: true, mood: true, energy: true, comment: true,
          createdAt: true, workoutAssignmentId: true,
          execution: { select: { startedAt: true } },
          assignment: { select: { sourceLabel: true, workout: { select: { title: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
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

    const history = new CanReadAthleteHistory(this.db, this.clock);
    let feedbackWithheld = 0;
    for (const feedback of feedbacks) {
      // Dated at the session it refers to, not at the moment it was typed: a
      // grant bounded by dates is about the period the training happened in.
      const occurredAt = feedback.execution?.startedAt ?? feedback.createdAt;
      const allowed = await history.execute(actorUserId, {
        athleteId,
        schoolId: context.schoolId,
        category: "athleteFeedback",
        occurredAt,
      });
      if (!allowed) {
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

    entries.sort((a, b) => {
      const byDate = b.occurredAt.getTime() - a.occurredAt.getTime();
      // Stable id tie-breaker, as the module's pagination convention requires.
      return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
    });

    return {
      context,
      entries: entries.slice(0, limit),
      hasMore: entries.length > limit,
      limit,
      feedbackWithheld,
    };
  }
}
