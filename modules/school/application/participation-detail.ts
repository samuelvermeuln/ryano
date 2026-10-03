/**
 * SAM-57 — everything the event detail shows (§19.1 tabs): the event with its
 * modality rows, the participation, the follow-up state and the history of
 * revisions of the participation, of the event and of the follow-up — each
 * entry with author and date. Authorized like the rest of the event core.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { describeEventConditions, describeSegments } from "../domain/sport-event-details";
import { daysUntilEvent, isPastEvent } from "../domain/sport-event";
import { preparationSummaryOf } from "./event-preparations";
import { resolveEventActor } from "./sport-events";

export type HistoryEntry = { at: Date; source: "participation" | "event" | "preparation"; actorName: string | null; summary: string; reason: string | null };

export class GetParticipationDetail {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, participationId: string) {
    const row = await this.db.athleteEventParticipation.findUnique({
      where: { id: z.string().min(1).max(256).parse(participationId) },
      include: {
        event: { include: { revisions: { include: { changedBy: { select: { name: true } } } } } },
        option: true,
        revisions: { include: { changedBy: { select: { name: true } } } },
        preparation: { include: { transitions: { include: { actor: { select: { name: true } } } } } },
      },
    });
    if (!row) throw new SchoolError("PARTICIPATION_NOT_FOUND", "Evento não encontrado.", 404);
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, row.athleteId);
    const now = this.clock();
    const preparation = await preparationSummaryOf(this.db, this.clock, row.id);

    const fields = (changes: unknown) => Object.keys((changes ?? {}) as Record<string, unknown>).join(", ");
    const history: HistoryEntry[] = [
      ...row.revisions.map((revision) => ({ at: revision.changedAt, source: "participation" as const, actorName: revision.changedBy.name, summary: `Participação alterada: ${fields(revision.changes)}`, reason: revision.reason })),
      ...row.event.revisions.map((revision) => ({ at: revision.changedAt, source: "event" as const, actorName: revision.changedBy.name, summary: `Evento alterado: ${fields(revision.changes)}`, reason: revision.reason })),
      ...(row.preparation?.transitions ?? []).map((transition) => ({ at: transition.at, source: "preparation" as const, actorName: transition.actor?.name ?? null, summary: `Acompanhamento: ${transition.toStatus}`, reason: transition.reason })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      viewer: actor.kind,
      participation: {
        id: row.id, status: row.status, suggestedPriority: row.suggestedPriority, agreedPriority: row.agreedPriority,
        category: row.category, relayRole: row.relayRole, goalText: row.goalText, availabilityUntilEvent: row.availabilityUntilEvent,
        travelNotes: row.travelNotes, registrationProofUrl: row.registrationProofUrl, needsReview: row.needsReviewSince !== null, version: row.version,
      },
      event: {
        id: row.event.id, name: row.event.name, edition: row.event.edition, type: row.event.type, sportType: row.event.sportType,
        environment: row.event.environment, startLocalDate: row.event.startLocalDate, endLocalDate: row.event.endLocalDate,
        dateConfirmed: row.event.dateConfirmed, startAt: row.event.startAt, startTimeStatus: row.event.startTimeStatus,
        timeZone: row.event.timeZone, city: row.event.city, venue: row.event.venue, organizer: row.event.organizer,
        officialUrl: row.event.officialUrl, regulationUrl: row.event.regulationUrl, regulationConsultedOn: row.event.regulationConsultedOn,
        status: row.event.status, origin: row.event.origin, visibility: row.event.visibility, version: row.event.version,
        conditions: describeEventConditions(row.event.sportType, row.event.details, row.event.timeZone),
      },
      option: row.option
        ? { id: row.option.id, label: row.option.label, distanceValue: row.option.distanceValue == null ? null : Number(row.option.distanceValue), distanceUnit: row.option.distanceUnit, cutoffTotalMinutes: row.option.cutoffTotalMinutes, courseUrl: row.option.courseUrl, segments: describeSegments(row.option.details) }
        : null,
      daysUntil: daysUntilEvent(row.event, now),
      past: isPastEvent(row.event, now),
      preparation,
      lastRevisionAt: history[0]?.at ?? null,
      history,
    };
  }
}
