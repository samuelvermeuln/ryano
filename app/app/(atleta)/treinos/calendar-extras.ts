/**
 * SAM-57 — what the athlete's calendar shows besides prescriptions and
 * activities: their events (one item per day of the event) and their
 * unavailability periods (§19.1). Dates are local "YYYY-MM-DD"; the calendar
 * grid also keys days as ISO dates, so membership is a string comparison.
 */
import { prisma } from "@/server/db";
import { toISODate, type DateRange } from "./date-helpers";

export type CalendarEvent = {
  participationId: string;
  name: string;
  sportType: string;
  startLocalDate: string;
  endLocalDate: string | null;
  optionLabel: string | null;
  status: string;
};

export type CalendarUnavailability = { id: string; startLocalDate: string; endLocalDate: string; reason: string };

export type CalendarExtras = { events: CalendarEvent[]; unavailabilities: CalendarUnavailability[] };

export const NO_EXTRAS: CalendarExtras = { events: [], unavailabilities: [] };

function bounds(range: DateRange) {
  return { from: toISODate(range.start), to: toISODate(new Date(range.end.getTime() - 1)) };
}

/** Participations not cancelled whose event touches the range; `sport` filters by the event's modality. */
export async function getCalendarExtras(athleteId: string, range: DateRange, sport: string | null): Promise<CalendarExtras> {
  const { from, to } = bounds(range);
  const [participations, unavailabilities] = await Promise.all([
    prisma.athleteEventParticipation.findMany({
      where: {
        athleteId,
        status: { not: "CANCELLED" },
        event: {
          startLocalDate: { lte: to },
          OR: [{ endLocalDate: { gte: from } }, { endLocalDate: null, startLocalDate: { gte: from } }],
          ...(sport ? { sportType: sport } : {}),
        },
      },
      select: { id: true, event: { select: { name: true, sportType: true, startLocalDate: true, endLocalDate: true, status: true } }, option: { select: { label: true } } },
      orderBy: { event: { startLocalDate: "asc" } },
    }),
    // Unavailability has no modality: it shows under any filter.
    prisma.athleteUnavailability.findMany({
      where: { athleteId, startLocalDate: { lte: to }, endLocalDate: { gte: from } },
      select: { id: true, startLocalDate: true, endLocalDate: true, reason: true },
      orderBy: { startLocalDate: "asc" },
    }),
  ]);
  return {
    events: participations.map((row) => ({
      participationId: row.id, name: row.event.name, sportType: row.event.sportType, startLocalDate: row.event.startLocalDate,
      endLocalDate: row.event.endLocalDate, optionLabel: row.option?.label ?? null, status: row.event.status,
    })),
    unavailabilities,
  };
}

export function extrasOnDay(extras: CalendarExtras, isoDate: string): CalendarExtras {
  return {
    events: extras.events.filter((event) => event.startLocalDate <= isoDate && isoDate <= (event.endLocalDate ?? event.startLocalDate)),
    unavailabilities: extras.unavailabilities.filter((period) => period.startLocalDate <= isoDate && isoDate <= period.endLocalDate),
  };
}

/** `?modalidade=` — a canonical sport type, or null for "todas". */
export function parseSportParam(value: string | undefined, allowed: readonly string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}
