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
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}
