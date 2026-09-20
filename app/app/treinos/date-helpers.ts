/**
 * Pure date helpers for /app/treinos — no Prisma, no Next.js imports, safe to
 * unit test in isolation. Every computation is forced to UTC (setUTCHours,
 * getUTCDay, Date.UTC, timeZone: "UTC") to avoid timezone drift when comparing
 * dates as "YYYY-MM-DD" strings — this mirrors the convention the original
 * weekly view already relied on and must be kept consistent across every view.
 */

export const VALID_VIEWS = ["day", "week", "month", "year", "list"] as const;
export type ViewMode = (typeof VALID_VIEWS)[number];

export type TreinosSearchParams = {
  view?: string;
  week?: string;
  date?: string;
  month?: string;
  year?: string;
};

export type DateRange = { start: Date; end: Date };

// ---------------------------------------------------------------------------
// Parsing (defensive: invalid/missing input always falls back to "now", never throws)
// ---------------------------------------------------------------------------

export function parseViewParam(view: string | undefined): ViewMode {
  return (VALID_VIEWS as readonly string[]).includes(view ?? "") ? (view as ViewMode) : "week";
}

export function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getISOMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

export function parseWeekParam(week: string | undefined): Date {
  if (!week) return getISOMonday(new Date());
  const d = new Date(`${week}T00:00:00Z`);
  return isNaN(d.getTime()) ? getISOMonday(new Date()) : getISOMonday(d);
}

export function parseDayParam(date: string | undefined): Date {
  if (!date) return todayUTC();
  const d = new Date(`${date}T00:00:00Z`);
  return isNaN(d.getTime()) ? todayUTC() : d;
}

const MONTH_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonthParam(month: string | undefined): Date {
  if (!month || !MONTH_PARAM_RE.test(month)) {
    const now = todayUTC();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1));
}

const YEAR_PARAM_RE = /^\d{4}$/;

export function parseYearParam(year: string | undefined): Date {
  if (!year || !YEAR_PARAM_RE.test(year)) {
    return new Date(Date.UTC(todayUTC().getUTCFullYear(), 0, 1));
  }
  return new Date(Date.UTC(Number(year), 0, 1));
}

export function getAnchorDate(view: ViewMode, params: TreinosSearchParams): Date {
  switch (view) {
    case "day": return parseDayParam(params.date);
    case "week": return parseWeekParam(params.week);
    case "month": return parseMonthParam(params.month);
    case "year": return parseYearParam(params.year);
    // The list view is windowed to a single month (see queries.ts) so it shares
    // the month anchor/param with month-view.
    case "list": return parseMonthParam(params.month);
  }
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

export function getDayRange(d: Date): DateRange {
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function getWeekRange(monday: Date): DateRange {
  const start = new Date(monday);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthRange(monthStart: Date): DateRange {
  const start = new Date(monthStart);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

export function getYearRange(yearStart: Date): DateRange {
  const start = new Date(Date.UTC(yearStart.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 0, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Full Mon–Sun grid covering the month (leading/trailing days from adjacent
 *  months included), always a multiple of 7. */
export function getMonthGridDays(monthStart: Date): Date[] {
  const { end: monthEnd } = getMonthRange(monthStart);
  const gridStart = getISOMonday(monthStart);
  const gridEnd = addDaysUTC(getISOMonday(monthEnd), 6);

  const days: Date[] = [];
  for (let cursor = new Date(gridStart); cursor.getTime() <= gridEnd.getTime(); cursor = addDaysUTC(cursor, 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

// ---------------------------------------------------------------------------
// Arithmetic (only ever called with day-1-of-month / Jan-1 anchors, so month
// and year rollover never needs day-overflow correction)
// ---------------------------------------------------------------------------

export function addDaysUTC(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function addMonthsUTC(d: Date, months: number): Date {
  const copy = new Date(d);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

export function addYearsUTC(d: Date, years: number): Date {
  const copy = new Date(d);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtShort(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function monthParam(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
