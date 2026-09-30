/**
 * SAM-16 — the coach's weekly agenda: prescriptions positioned by the school's
 * wall clock and collapsed into one chip per (day, HH:mm) slot.
 *
 * Grouping happens here rather than in the query because the slot key is a
 * wall-clock time in the school's zone, which the database (UTC instants)
 * cannot group by without a per-row zone conversion. Pure: no Prisma, no
 * React, unit-testable with plain objects.
 */
import {
  addCalendarDays,
  utcToLocalDateTime,
  type LocalDate,
} from "../domain/local-date";

export type AgendaItem = {
  assignmentId: string;
  athlete: { id: string; name: string };
  title: string;
  sportType: string | null;
  team: { id: string; name: string } | null;
  coach: { id: string; name: string } | null;
  status: string;
  scheduledAt: Date;
  dueAt: Date | null;
  /** True when the viewer is the coach responsible for this prescription and may reschedule it. */
  canReschedule: boolean;
};

export type AgendaEntry = AgendaItem & {
  /** Wall-clock date and time of `scheduledAt` in the school's zone. */
  localDate: LocalDate;
  localTime: string;
};

export type AgendaSlot = {
  /** `${localDate}T${localTime}` — stable id for the chip and its modal. */
  key: string;
  date: LocalDate;
  time: string;
  hour: number;
  entries: AgendaEntry[];
  /** Distinct team names among the entries, in first-seen order. */
  teams: string[];
  /** Distinct canonical sport types among the entries, in first-seen order. */
  sportTypes: string[];
};

export type AgendaDay = {
  date: LocalDate;
  slots: AgendaSlot[];
};

export type WeeklyAgenda = {
  days: AgendaDay[];
  /** Hour bands that have at least one slot in the week, ascending. */
  hours: number[];
};

/** Hour bands shown when the week is empty, so the grid still reads as a day. */
export const DEFAULT_AGENDA_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * Seven days starting at `weekStart`, each with its slots sorted by time and
 * each slot's entries sorted by athlete name. An item outside the week is
 * dropped rather than thrown: the query window and the zone conversion can
 * disagree by a few hours at the week's edges, and that is not a bug to crash on.
 */
export function buildWeeklyAgenda(items: AgendaItem[], weekStart: LocalDate, timeZone: string): WeeklyAgenda {
  const dates = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const slotsByKey = new Map<string, AgendaSlot>();

  for (const item of items) {
    const local = utcToLocalDateTime(item.scheduledAt, timeZone);
    if (!dates.includes(local.date)) continue;
    const key = `${local.date}T${local.time}`;
    let slot = slotsByKey.get(key);
    if (!slot) {
      slot = {
        key,
        date: local.date,
        time: local.time,
        hour: Math.floor(local.minutesOfDay / 60),
        entries: [],
        teams: [],
        sportTypes: [],
      };
      slotsByKey.set(key, slot);
    }
    slot.entries.push({ ...item, localDate: local.date, localTime: local.time });
  }

  const collator = new Intl.Collator("pt-BR");
  for (const slot of slotsByKey.values()) {
    slot.entries.sort((a, b) => collator.compare(a.athlete.name, b.athlete.name));
    slot.teams = distinct(slot.entries.map((entry) => entry.team?.name));
    slot.sportTypes = distinct(slot.entries.map((entry) => entry.sportType));
  }

  const days: AgendaDay[] = dates.map((date) => ({
    date,
    slots: [...slotsByKey.values()]
      .filter((slot) => slot.date === date)
      .sort((a, b) => a.time.localeCompare(b.time)),
  }));

  const hours = [...new Set([...slotsByKey.values()].map((slot) => slot.hour))].sort((a, b) => a - b);
  return { days, hours: hours.length > 0 ? hours : DEFAULT_AGENDA_HOURS };
}

/** "06:00 · 3 atletas · Turma Manhã · Corrida" — what the chip says before it is expanded. */
export function describeAgendaSlot(
  slot: AgendaSlot,
  sportLabel: (sportType: string) => string | null,
): { time: string; who: string; detail: string | null } {
  const who = slot.entries.length === 1
    ? slot.entries[0].athlete.name
    : `${slot.entries.length} atletas`;
  const teams = slot.teams.length > 2 ? `${slot.teams.length} turmas` : slot.teams.join(", ");
  const sports = slot.sportTypes.map((sport) => sportLabel(sport) ?? sport);
  const detail = [teams, sports.join(", ")].filter(Boolean).join(" · ");
  return { time: slot.time, who, detail: detail || null };
}
