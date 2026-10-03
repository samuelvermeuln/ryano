/**
 * SAM-51 — use cases for sports events and athlete participation (§5, §20,
 * §21.3 "Criar participação; alterar evento").
 *
 * Authorization is server-side and reuses the coaching gates (§20, AC21):
 * the athlete acts on their own participations; a coach or the school's
 * management acts only while `CanReadAthleteCurrentData` says the relation is
 * active. Every change keeps a before/after revision with its author (§5.5);
 * a stale write is refused with a recoverable conflict (§21.5).
 *
 * Nothing here decides training (ADR-010): creating a participation records
 * the athlete's intention; the coach's follow-up is SAM-54.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc } from "../domain/local-date";
import {
  daysUntilEvent,
  diffFields,
  eventDuplicateKey,
  isPastEvent,
  participationInputSchema,
  participationPatchSchema,
  REVIEW_TRIGGERING_FIELDS,
  sportEventInputSchema,
  sportEventOptionInputSchema,
} from "../domain/sport-event";
import { describeEventConditions, describeSegments, parseEventDetails, parseOptionDetails } from "../domain/sport-event-details";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";

/** Generic fields plus the modality fields (SAM-52), validated by the event's modality. */
function parseSportEvent(raw: unknown) {
  const event = sportEventInputSchema.parse(raw);
  return { ...event, details: parseEventDetails(event.sportType, event.details) };
}

function parseSportEventOption(sportType: string, raw: unknown) {
  const option = sportEventOptionInputSchema.parse(raw);
  return { ...option, details: parseOptionDetails(sportType, option.details) };
}

const opaqueId = z.string().min(1).max(256);

export type EventActor =
  | { kind: "athlete" }
  | { kind: "coach"; schoolId: string | null }
  | { kind: "school"; schoolId: string };

/**
 * Who `actorUserId` is for `athleteId`'s events, or 404. A coach with an
 * ended relation, or a professional with no relation at all, gets the same
 * answer as for an athlete that does not exist (AC03, AC21).
 */
export async function resolveEventActor(
  db: PrismaClient,
  clock: () => Date,
  actorUserId: string | null,
  athleteId: string,
): Promise<EventActor> {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  if (actorUserId === athleteId) return { kind: "athlete" };
  const now = clock();
  const [assignments, managed] = await Promise.all([
    db.coachAthleteAssignment.findMany({
      where: { athleteId, status: "ACTIVE", endedAt: null, startedAt: { lte: now }, coach: { userId: actorUserId } },
      select: { schoolId: true },
    }),
    db.schoolAthleteMembership.findMany({
      where: { athleteId, status: "ACTIVE", endedAt: null, startedAt: { lte: now } },
      select: { schoolId: true },
    }),
  ]);
  const gate = new CanReadAthleteCurrentData(db, clock);
  for (const assignment of assignments) {
    if (await gate.execute(actorUserId, { athleteId, schoolId: assignment.schoolId })) {
      return { kind: "coach", schoolId: assignment.schoolId };
    }
  }
  for (const membership of managed) {
    if (await gate.execute(actorUserId, { athleteId, schoolId: membership.schoolId })) {
      return { kind: "school", schoolId: membership.schoolId };
    }
  }
  throw new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado.", 404);
}

const createSchema = z.strictObject({
  /** Defaults to the actor (the athlete registering their own event). */
  athleteId: opaqueId.optional(),
  eventId: opaqueId.optional(),
  event: z.unknown().optional(),
  optionId: opaqueId.optional(),
  option: z.unknown().optional(),
  participation: z.unknown().optional(),
  /** The user confirmed the event is really different from the suggested duplicates. */
  confirmDistinct: z.boolean().default(false),
}).refine((input) => (input.eventId === undefined) !== (input.event === undefined), {
  message: "Escolha um evento existente ou cadastre um novo.",
  path: ["event"],
});

function startInstant(event: { startLocalDate: string; startTimeLocal: string | null; timeZone: string; dateConfirmed: boolean }): Date | null {
  if (!event.dateConfirmed || !event.startTimeLocal) return null;
  return localDateTimeToUtc(`${event.startLocalDate}T${event.startTimeLocal}`, event.timeZone);
}

export type DuplicateCandidate = { id: string; name: string; edition: string | null; startLocalDate: string; city: string | null };

export class CreateEventParticipation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = createSchema.parse(raw);
    const athleteId = input.athleteId ?? actorUserId ?? "";
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
    const participation = participationInputSchema.parse(input.participation ?? {});
    const now = this.clock();

    let eventId = input.eventId ?? null;
    let sportType: string;
    if (eventId) {
      const visible = await this.visibleEvent(actorUserId!, athleteId, eventId);
      if (!visible) throw new SchoolError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);
      sportType = visible.sportType;
    } else {
      const event = parseSportEvent(input.event);
      sportType = event.sportType;
      // A school-visible event is only created by that school's side.
      if (event.visibility === "SCHOOL" && actor.kind === "athlete") {
        throw new SchoolError("FORBIDDEN", "Só a escola publica eventos para a escola.", 403);
      }
      if (!input.confirmDistinct) {
        const candidates = await this.duplicates(actorUserId!, athleteId, event);
        if (candidates.length > 0) {
          throw new SchoolError("EVENT_DUPLICATE_SUSPECTED", JSON.stringify(candidates), 409);
        }
      }
      eventId = randomUUID();
      const startAt = startInstant(event);
      await this.db.sportEvent.create({
        data: {
          id: eventId,
          name: event.name, edition: event.edition, type: event.type, sportType: event.sportType,
          environment: event.environment, startLocalDate: event.startLocalDate, endLocalDate: event.endLocalDate,
          dateConfirmed: event.dateConfirmed, startAt, startTimeStatus: startAt ? "CONFIRMED" : "TO_BE_CONFIRMED",
          timeZone: event.timeZone, city: event.city, venue: event.venue, organizer: event.organizer,
          officialUrl: event.officialUrl, regulationUrl: event.regulationUrl,
          regulationConsultedOn: event.regulationConsultedOn, regulationVersion: event.regulationVersion,
          status: event.status, visibility: event.visibility,
          schoolId: event.visibility === "SCHOOL" && actor.kind !== "athlete" ? actor.schoolId : null,
          origin: actor.kind === "athlete" ? "ATHLETE" : actor.kind === "coach" ? "COACH" : "SCHOOL",
          createdByUserId: actorUserId!,
          details: event.details === null ? Prisma.JsonNull : (event.details as Prisma.InputJsonValue),
          createdAt: now, updatedAt: now,
        },
      });
    }

    let optionId = input.optionId ?? null;
    if (optionId) {
      const option = await this.db.sportEventOption.findFirst({ where: { id: optionId, eventId }, select: { id: true } });
      if (!option) throw new SchoolError("EVENT_OPTION_NOT_FOUND", "Distância/etapa não encontrada neste evento.", 404);
    } else if (input.option !== undefined) {
      const option = parseSportEventOption(sportType, input.option);
      const position = await this.db.sportEventOption.count({ where: { eventId } });
      optionId = randomUUID();
      await this.db.sportEventOption.create({
        data: {
          id: optionId, eventId, position,
          label: option.label, distanceValue: option.distanceValue, distanceUnit: option.distanceUnit,
          segment: option.segment, cutoffTotalMinutes: option.cutoffTotalMinutes, cutoffNotes: option.cutoffNotes,
          courseUrl: option.courseUrl, elevationGainM: option.elevationGainM,
          details: option.details === null ? Prisma.JsonNull : (option.details as Prisma.InputJsonValue),
          createdAt: now, updatedAt: now,
        },
      });
    }

    const created = await this.db.athleteEventParticipation.create({
      data: {
        id: randomUUID(), eventId, optionId, athleteId,
        status: participation.status, suggestedPriority: participation.suggestedPriority,
        category: participation.category, relayRole: participation.relayRole, goalText: participation.goalText,
        availabilityUntilEvent: participation.availabilityUntilEvent, travelNotes: participation.travelNotes,
        registrationProofUrl: participation.registrationProofUrl,
        createdByUserId: actorUserId!, createdAt: now, updatedAt: now,
      },
      include: { event: true, option: true },
    });
    return created;
  }

  /** Events this actor may attach a participation to (§5.2: a private event of someone else is not offered). */
  private async visibleEvent(actorUserId: string, athleteId: string, eventId: string) {
    const schoolIds = await athleteSchoolIds(this.db, athleteId, this.clock());
    return this.db.sportEvent.findFirst({
      where: {
        id: eventId,
        OR: [
          { visibility: "PUBLIC" },
          { visibility: "SCHOOL", schoolId: { in: schoolIds } },
          { createdByUserId: { in: [actorUserId, athleteId] } },
        ],
      },
      select: { id: true, sportType: true },
    });
  }

  private async duplicates(actorUserId: string, athleteId: string, event: { name: string; startLocalDate: string; city: string | null }): Promise<DuplicateCandidate[]> {
    const schoolIds = await athleteSchoolIds(this.db, athleteId, this.clock());
    const sameDay = await this.db.sportEvent.findMany({
      where: {
        startLocalDate: event.startLocalDate,
        OR: [
          { visibility: "PUBLIC" },
          { visibility: "SCHOOL", schoolId: { in: schoolIds } },
          { createdByUserId: { in: [actorUserId, athleteId] } },
        ],
      },
      select: { id: true, name: true, edition: true, startLocalDate: true, city: true },
      take: 50,
    });
    const key = eventDuplicateKey(event);
    return sameDay.filter((candidate) => eventDuplicateKey(candidate) === key);
  }
}

async function athleteSchoolIds(db: PrismaClient, athleteId: string, now: Date): Promise<string[]> {
  const rows = await db.schoolAthleteMembership.findMany({
    where: { athleteId, status: "ACTIVE", endedAt: null, startedAt: { lte: now } },
    select: { schoolId: true },
  });
  return rows.map((row) => row.schoolId);
}

export class UpdateEventParticipation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, participationId: string, raw: unknown) {
    const current = await this.db.athleteEventParticipation.findUnique({ where: { id: opaqueId.parse(participationId) } });
    if (!current) throw new SchoolError("PARTICIPATION_NOT_FOUND", "Participação não encontrada.", 404);
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, current.athleteId);
    const patch = participationPatchSchema.parse(raw);
    // The agreed priority is the coach's side of the agreement (§5.3).
    if (patch.agreedPriority !== undefined && actor.kind === "athlete") {
      throw new SchoolError("FORBIDDEN", "A prioridade pactuada é definida com o professor.", 403);
    }
    if (patch.optionId) {
      const option = await this.db.sportEventOption.findFirst({ where: { id: patch.optionId, eventId: current.eventId }, select: { id: true } });
      if (!option) throw new SchoolError("EVENT_OPTION_NOT_FOUND", "Distância/etapa não encontrada neste evento.", 404);
    }
    const { expectedVersion, reason, ...fields } = patch;
    const changes = diffFields(current as unknown as Record<string, unknown>, fields);
    if (Object.keys(changes).length === 0) return current;
    const now = this.clock();
    const needsReview = REVIEW_TRIGGERING_FIELDS.some((field) => field in changes) && actor.kind === "athlete";

    return this.db.$transaction(async (tx) => {
      const updated = await tx.athleteEventParticipation.updateMany({
        where: { id: current.id, version: expectedVersion },
        data: {
          ...fields,
          version: { increment: 1 },
          updatedAt: now,
          ...(needsReview && !current.needsReviewSince ? { needsReviewSince: now } : {}),
        },
      });
      if (updated.count === 0) {
        throw new SchoolError("PARTICIPATION_CONFLICT", "Esta participação foi alterada por outra pessoa. Recarregue e tente de novo.", 409);
      }
      await tx.participationRevision.create({
        data: { id: randomUUID(), participationId: current.id, changedByUserId: actorUserId!, changes: changes as Prisma.InputJsonValue, reason: reason ?? null, changedAt: now },
      });
      return tx.athleteEventParticipation.findUniqueOrThrow({ where: { id: current.id }, include: { event: true, option: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

const eventPatchSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().max(500).nullish(),
  event: z.unknown(),
});

export class UpdateSportEvent {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, eventId: string, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const current = await this.db.sportEvent.findUnique({
      where: { id: opaqueId.parse(eventId) },
      include: { participations: { select: { athleteId: true } } },
    });
    if (!current) throw new SchoolError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);
    // The creator edits; for a private event, so does whoever is authorized over one of its athletes.
    let allowed = current.createdByUserId === actorUserId;
    if (!allowed && current.visibility === "PRIVATE") {
      for (const { athleteId } of current.participations) {
        try {
          await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
          allowed = true;
          break;
        } catch {
          // not authorized over this athlete; try the next one
        }
      }
    }
    if (!allowed) throw new SchoolError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);

    const { expectedVersion, reason, event: rawEvent } = eventPatchSchema.parse(raw);
    const event = parseSportEvent(rawEvent);
    const startAt = startInstant(event);
    const next = {
      name: event.name, edition: event.edition, type: event.type, sportType: event.sportType, environment: event.environment,
      startLocalDate: event.startLocalDate, endLocalDate: event.endLocalDate, dateConfirmed: event.dateConfirmed,
      startAt, startTimeStatus: startAt ? "CONFIRMED" : "TO_BE_CONFIRMED", timeZone: event.timeZone,
      city: event.city, venue: event.venue, organizer: event.organizer, officialUrl: event.officialUrl,
      regulationUrl: event.regulationUrl, regulationConsultedOn: event.regulationConsultedOn,
      regulationVersion: event.regulationVersion, status: event.status, details: event.details,
    };
    const changes = diffFields(current as unknown as Record<string, unknown>, next);
    if (Object.keys(changes).length === 0) return current;
    const now = this.clock();
    const datesChanged = "startLocalDate" in changes || "endLocalDate" in changes || "status" in changes;

    return this.db.$transaction(async (tx) => {
      const updated = await tx.sportEvent.updateMany({
        where: { id: current.id, version: expectedVersion },
        data: {
          ...next,
          details: next.details === null ? Prisma.JsonNull : (next.details as Prisma.InputJsonValue),
          version: { increment: 1 },
          updatedAt: now,
        },
      });
      if (updated.count === 0) {
        throw new SchoolError("EVENT_CONFLICT", "Este evento foi alterado por outra pessoa. Recarregue e tente de novo.", 409);
      }
      await tx.sportEventRevision.create({
        data: { id: randomUUID(), eventId: current.id, changedByUserId: actorUserId, changes: changes as Prisma.InputJsonValue, reason: reason ?? null, changedAt: now },
      });
      // §5.5 — a new date, distance or a cancellation asks every responsible coach to review.
      if (datesChanged) {
        await tx.athleteEventParticipation.updateMany({
          where: { eventId: current.id, needsReviewSince: null, status: { not: "CANCELLED" } },
          data: { needsReviewSince: now },
        });
      }
      return tx.sportEvent.findUniqueOrThrow({ where: { id: current.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

export type ParticipationView = {
  id: string;
  status: string;
  suggestedPriority: string;
  agreedPriority: string | null;
  goalText: string | null;
  needsReview: boolean;
  version: number;
  event: {
    id: string; name: string; edition: string | null; type: string; sportType: string; environment: string | null;
    startLocalDate: string; endLocalDate: string | null; dateConfirmed: boolean; startAt: Date | null;
    startTimeStatus: string; timeZone: string; city: string | null; venue: string | null; status: string;
    origin: string; visibility: string; version: number;
  };
  option: { id: string; label: string; distanceValue: number | null; distanceUnit: string | null } | null;
  /** In the event's zone; null when the date is not confirmed (no exact countdown). */
  daysUntil: number | null;
  past: boolean;
  /** Other active MAIN participations of this athlete — "duas provas principais": conciliation, never cancellation (§5.5). */
  otherMainEvents: Array<{ participationId: string; name: string; startLocalDate: string }>;
};

export class ListAthleteParticipations {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, athleteId: string): Promise<{ actor: EventActor; participations: ParticipationView[] }> {
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
    const rows = await this.db.athleteEventParticipation.findMany({
      where: { athleteId },
      include: { event: true, option: true },
      orderBy: [{ event: { startLocalDate: "asc" } }, { createdAt: "asc" }],
    });
    const now = this.clock();
    const priority = (row: (typeof rows)[number]) => row.agreedPriority ?? row.suggestedPriority;
    const activeMain = rows.filter((row) => priority(row) === "MAIN" && row.status !== "CANCELLED" && !isPastEvent(row.event, now));
    return {
      actor,
      participations: rows.map((row) => ({
        id: row.id,
        status: row.status,
        suggestedPriority: row.suggestedPriority,
        agreedPriority: row.agreedPriority,
        goalText: row.goalText,
        needsReview: row.needsReviewSince !== null,
        version: row.version,
        event: {
          id: row.event.id, name: row.event.name, edition: row.event.edition, type: row.event.type,
          sportType: row.event.sportType, environment: row.event.environment, startLocalDate: row.event.startLocalDate,
          endLocalDate: row.event.endLocalDate, dateConfirmed: row.event.dateConfirmed, startAt: row.event.startAt,
          startTimeStatus: row.event.startTimeStatus, timeZone: row.event.timeZone, city: row.event.city,
          venue: row.event.venue, status: row.event.status, origin: row.event.origin, visibility: row.event.visibility,
          version: row.event.version,
        },
        option: row.option
          ? { id: row.option.id, label: row.option.label, distanceValue: row.option.distanceValue == null ? null : Number(row.option.distanceValue), distanceUnit: row.option.distanceUnit }
          : null,
        daysUntil: daysUntilEvent(row.event, now),
        past: isPastEvent(row.event, now),
        otherMainEvents: priority(row) === "MAIN" && row.status !== "CANCELLED" && !isPastEvent(row.event, now)
          ? activeMain.filter((other) => other.id !== row.id).map((other) => ({ participationId: other.id, name: other.event.name, startLocalDate: other.event.startLocalDate }))
          : [],
      })),
    };
  }
}

/** Events the actor may pick when registering (public, the athlete's schools, own private ones). */
export class SearchVisibleEvents {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { q, athleteId } = z.strictObject({ q: z.string().trim().max(120).default(""), athleteId: opaqueId.optional() }).parse(raw);
    const target = athleteId ?? actorUserId;
    await resolveEventActor(this.db, this.clock, actorUserId, target);
    const schoolIds = await athleteSchoolIds(this.db, target, this.clock());
    return this.db.sportEvent.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        status: { not: "CANCELLED" },
        OR: [
          { visibility: "PUBLIC" },
          { visibility: "SCHOOL", schoolId: { in: schoolIds } },
          { createdByUserId: { in: [actorUserId, target] } },
        ],
      },
      include: { options: { orderBy: { position: "asc" } } },
      orderBy: { startLocalDate: "asc" },
      take: 30,
    });
  }
}

/**
 * One event with its options and the modality rows (SAM-52): conditions with
 * provenance — "desconhecida" when nobody informed it — and multisport segments.
 * Visible when public, created by the actor, of one of the actor's schools,
 * or when the actor takes part / follows someone who takes part.
 */
export class GetSportEvent {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, eventId: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const event = await this.db.sportEvent.findUnique({
      where: { id: opaqueId.parse(eventId) },
      include: { options: { orderBy: { position: "asc" } }, participations: { select: { athleteId: true } } },
    });
    if (!event || !await this.canSee(actorUserId, event)) throw new SchoolError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);
    return {
      ...event,
      // Who takes part is not part of the event's public detail.
      participations: undefined,
      options: event.options.map((option) => ({
        ...option,
        distanceValue: option.distanceValue == null ? null : Number(option.distanceValue),
        segments: describeSegments(option.details),
      })),
      conditions: describeEventConditions(event.sportType, event.details, event.timeZone),
    };
  }

  private async canSee(actorUserId: string, event: { visibility: string; createdByUserId: string; schoolId: string | null; participations: Array<{ athleteId: string }> }) {
    if (event.visibility === "PUBLIC" || event.createdByUserId === actorUserId) return true;
    if (event.participations.some((participation) => participation.athleteId === actorUserId)) return true;
    const now = this.clock();
    if (event.visibility === "SCHOOL" && event.schoolId) {
      const [athlete, staff] = await Promise.all([
        this.db.schoolAthleteMembership.findFirst({ where: { athleteId: actorUserId, schoolId: event.schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now } }, select: { id: true } }),
        this.db.schoolMembership.findFirst({ where: { userId: actorUserId, schoolId: event.schoolId, status: "ACTIVE", endedAt: null }, select: { id: true } }),
      ]);
      if (athlete || staff) return true;
    }
    for (const athleteId of new Set(event.participations.map((participation) => participation.athleteId))) {
      try {
        await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
        return true;
      } catch {
        // not authorized over this participant
      }
    }
    return false;
  }
}
