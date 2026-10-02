/**
 * SAM-16 — the coach's weekly agenda: prescriptions positioned by the school's
 * wall clock and collapsed into one chip per (day, HH:mm) slot.
 *
 * SAM-36 — the agenda is a calendar of what was planned AND what happened:
 * besides prescriptions (with their prescribed × executed outcome) it carries
 * imported activities nobody matched and sessions the athlete logged by hand,
 * each as its own item kind, plus the period's totals.
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
import { PrescriptionOutcome } from "../domain/prescription-outcome";

export type AgendaItemKind = "prescription" | "unplanned-import" | "unplanned-self";

export type AgendaItem = {
  /** What the item is; decides the chip, the link and the totals bucket. */
  kind: AgendaItemKind;
  /** The prescription (or the self-logged UNPLANNED assignment); null for an imported activity. */
  assignmentId: string | null;
  /** The imported `Activity`; null for prescriptions and self-logged sessions. */
  activityId: string | null;
  athlete: { id: string; name: string };
  title: string;
  sportType: string | null;
  team: { id: string; name: string } | null;
  coach: { id: string; name: string } | null;
  status: string;
  /** Prescribed × executed (SAM-33); UNPLANNED_ACTIVITY for the unplanned kinds; null when withdrawn. */
  outcome: PrescriptionOutcome | null;
  /** When it is placed on the calendar: the prescription's time, or the activity's start. */
  scheduledAt: Date;
  dueAt: Date | null;
  /** What was actually done, when known (executed prescription or activity). */
  durationSeconds: number | null;
  distanceMeters: number | null;
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
  /** Distinct item kinds among the entries, in first-seen order. */
  kinds: AgendaItemKind[];
};

export type AgendaDay = {
  date: LocalDate;
  slots: AgendaSlot[];
};

/** SAM-36 — what the period adds up to, prescribed or not. */
export type AgendaTotals = {
  items: number;
  prescriptions: number;
  /** Prescriptions with a matched execution (as planned, partially or differently). */
  executed: number;
  /** Prescriptions still open or missed, i.e. PLANNED_NOT_EXECUTED. */
  notExecuted: number;
  unplanned: number;
  athletes: number;
  /** Σ of what was done (executed prescriptions + unplanned items); planned-only items add nothing. */
  durationSeconds: number;
  distanceMeters: number;
};

export type WeeklyAgenda = {
  days: AgendaDay[];
  /** Hour bands that have at least one slot in the week, ascending. */
  hours: number[];
  totals: AgendaTotals;
};

/** Hour bands shown when the week is empty, so the grid still reads as a day. */
export const DEFAULT_AGENDA_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const EXECUTED_OUTCOMES: ReadonlySet<string> = new Set([
  PrescriptionOutcome.EXECUTED_AS_PLANNED,
  PrescriptionOutcome.EXECUTED_PARTIALLY,
  PrescriptionOutcome.EXECUTED_DIFFERENTLY,
]);

function distinct<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))];
}

export function summarizeAgendaItems(items: readonly AgendaItem[]): AgendaTotals {
  const totals: AgendaTotals = {
    items: items.length, prescriptions: 0, executed: 0, notExecuted: 0, unplanned: 0,
    athletes: new Set(items.map((item) => item.athlete.id)).size,
    durationSeconds: 0, distanceMeters: 0,
  };
  for (const item of items) {
    if (item.kind === "prescription") {
      totals.prescriptions += 1;
      if (item.outcome && EXECUTED_OUTCOMES.has(item.outcome)) totals.executed += 1;
      if (item.outcome === PrescriptionOutcome.PLANNED_NOT_EXECUTED) totals.notExecuted += 1;
    } else {
      totals.unplanned += 1;
    }
    // Only what happened counts as volume; a plan still to be done adds nothing.
    if (item.kind !== "prescription" || (item.outcome && EXECUTED_OUTCOMES.has(item.outcome))) {
      totals.durationSeconds += item.durationSeconds ?? 0;
      totals.distanceMeters += item.distanceMeters ?? 0;
    }
  }
  return totals;
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
  const inWeek: AgendaItem[] = [];

  for (const item of items) {
    const local = utcToLocalDateTime(item.scheduledAt, timeZone);
    if (!dates.includes(local.date)) continue;
    inWeek.push(item);
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
        kinds: [],
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
    slot.kinds = distinct(slot.entries.map((entry) => entry.kind));
  }

  const days: AgendaDay[] = dates.map((date) => ({
    date,
    slots: [...slotsByKey.values()]
      .filter((slot) => slot.date === date)
      .sort((a, b) => a.time.localeCompare(b.time)),
  }));

  const hours = [...new Set([...slotsByKey.values()].map((slot) => slot.hour))].sort((a, b) => a - b);
  return { days, hours: hours.length > 0 ? hours : DEFAULT_AGENDA_HOURS, totals: summarizeAgendaItems(inWeek) };
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
  const unplanned = slot.entries.filter((entry) => entry.kind !== "prescription").length;
  const detail = [teams, sports.join(", "), unplanned > 0 ? (unplanned === slot.entries.length ? "não planejada" : `${unplanned} não planejada(s)`) : null]
    .filter(Boolean).join(" · ");
  return { time: slot.time, who, detail: detail || null };
}
