/**
 * TM011 — IANA-timezone-correct local date math, with no date library
 * dependency (none is installed in this project).
 *
 * The bug this replaces: computing a "Monday" by mutating a UTC `Date` with
 * `setUTCDate`/`setUTCHours(0,0,0,0)` always anchors at UTC midnight,
 * regardless of the athlete's timezone — and on a DST transition day, "add
 * 24h to the previous instant" lands on the wrong local calendar day (a day
 * can be 23h or 25h long in the athlete's zone). This module works in two
 * separate steps instead: (1) pure calendar-date arithmetic on a "YYYY-MM-DD"
 * string (no timezone involved, so it cannot be affected by DST), then (2)
 * one IANA-timezone conversion per resulting local date, so each day's
 * offset is computed independently at the actual date DST would affect.
 */

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type LocalDate = string; // "YYYY-MM-DD"

export function isValidLocalDate(value: string): value is LocalDate {
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  // Date.UTC normalizes overflow (e.g. day 31 of Feb -> March), so compare
  // back to reject "2026-02-31" instead of silently accepting it as March 3.
  const asDate = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    asDate.getUTCFullYear() === Number(y) &&
    asDate.getUTCMonth() === Number(mo) - 1 &&
    asDate.getUTCDate() === Number(d)
  );
}

/** Adds `days` (may be negative) to a local date, in the proleptic Gregorian calendar — no timezone involved. */
export function addCalendarDays(date: LocalDate, days: number): LocalDate {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  const [, y, mo, d] = m;
  const shifted = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + days));
  return toIsoDateString(shifted);
}

function toIsoDateString(d: Date): LocalDate {
  return `${d.getUTCFullYear().toString().padStart(4, "0")}-${(d.getUTCMonth() + 1).toString().padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}`;
}

/** ISO weekday of a local date: 1=Monday … 7=Sunday. Pure calendar math, no timezone. */
export function isoWeekday(date: LocalDate): number {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  const [, y, mo, d] = m;
  const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

/** The Monday on or before `date` (pure calendar math). */
export function mondayOnOrBefore(date: LocalDate): LocalDate {
  return addCalendarDays(date, -(isoWeekday(date) - 1));
}

/**
 * TM041 — "today" as a local calendar date in `timeZone`, for the
 * START_NOW activation mode (RF-109): the athlete's current wall-clock date,
 * not the server's UTC date, which can already be tomorrow/yesterday
 * relative to a distant timezone at the moment of the request.
 */
export function todayLocalDate(now: Date, timeZone: string): LocalDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/**
 * The UTC instant corresponding to local midnight of `date` in `timeZone`.
 * Recomputes the offset independently, so it is correct on either side of a
 * DST transition (the whole reason this function exists instead of a fixed
 * `+/-3h` offset table).
 */
export function localMidnightToUtc(date: LocalDate, timeZone: string): Date {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  const [, y, mo, d] = m;
  // Initial guess: treat the local date as if it were UTC.
  const guess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0));
  const offsetMinutes = timeZoneOffsetMinutesAt(guess, timeZone);
  // `guess` currently reads as "date 00:00" when INTERPRETED in UTC; shifting
  // it by the zone's offset at that instant turns it into "date 00:00 in
  // timeZone, expressed as a UTC instant".
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

/** Minutes to ADD to a UTC instant to get the wall-clock time in `timeZone` (matches `Date.getTimezoneOffset()` sign convention: positive = behind UTC). */
function timeZoneOffsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = wallClockParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - instant.getTime()) / 60_000;
}

function wallClockParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

// ---------------------------------------------------------------------------
// SAM-16 — wall-clock <-> instant, for the school's calendar
// ---------------------------------------------------------------------------

const LOCAL_DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** `Intl` throws on an unknown zone; the form's zone is user input, so it is checked before use. */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The UTC instant of a wall-clock `YYYY-MM-DDTHH:mm[:ss]` (the `datetime-local`
 * value) read in `timeZone`. Two passes: the offset is looked up at the naive
 * guess, then again at the corrected instant, so a time typed on the day the
 * zone changes offset lands on the right side of the transition. A time inside
 * a spring-forward gap resolves to the instant after the gap.
 */
export function localDateTimeToUtc(local: string, timeZone: string): Date {
  const m = LOCAL_DATE_TIME_RE.exec(local);
  if (!m || !isValidLocalDate(m[1])) throw new RangeError(`Invalid local date-time: ${local}`);
  const [, date, hh, mm, ss] = m;
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss ?? "0");
  if (hour > 23 || minute > 59 || second > 59) throw new RangeError(`Invalid local date-time: ${local}`);
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hour, minute, second);
  const firstPass = guess - timeZoneOffsetMinutesAt(new Date(guess), timeZone) * 60_000;
  const corrected = guess - timeZoneOffsetMinutesAt(new Date(firstPass), timeZone) * 60_000;
  // The two passes only disagree inside a spring-forward gap; the later
  // instant is the one after the clocks jumped, i.e. the time that exists.
  return new Date(Math.max(firstPass, corrected));
}

export type LocalDateTime = {
  date: LocalDate;
  /** "HH:mm", 24h. */
  time: string;
  /** Minutes since local midnight; what a calendar grid positions by. */
  minutesOfDay: number;
};

/** The wall-clock date and time of `instant` in `timeZone`. */
export function utcToLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
  const p = wallClockParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    minutesOfDay: p.hour * 60 + p.minute,
  };
}

// ---------------------------------------------------------------------------
// SAM-16 — ISO weeks, pure calendar math (the agenda's `?semana=2026-W40`)
// ---------------------------------------------------------------------------

const ISO_WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** ISO 8601 week of a local date: the week containing the year's first Thursday is week 1. */
export function isoWeekOf(date: LocalDate): { year: number; week: number } {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  const [, y, mo, d] = m;
  const target = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Move to the Thursday of this week: its year is the ISO year.
  target.setUTCDate(target.getUTCDate() + 4 - isoWeekday(date));
  const isoYear = target.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((target.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { year: isoYear, week };
}

export function formatIsoWeek(date: LocalDate): string {
  const { year, week } = isoWeekOf(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of ISO week `YYYY-Www`, or `null` when the text is not a valid week. */
export function mondayOfIsoWeek(value: string): LocalDate | null {
  const m = ISO_WEEK_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // January 4th is always in week 1; its Monday anchors the year.
  const week1Monday = mondayOnOrBefore(`${String(year).padStart(4, "0")}-01-04`);
  const monday = addCalendarDays(week1Monday, (week - 1) * 7);
  // Week 53 only exists in long years; otherwise the arithmetic lands in the next year.
  return isoWeekOf(monday).year === year ? monday : null;
}
