/**
 * SAM-56 — deadlines and reminders (§7.2–7.3, §21.4–21.5, AC20 of
 * docs/ryvano_treinos_eventos_acompanhamento.md). Pure calendar math.
 *
 * Deadlines are product options set by the school/coach (FollowUpPolicy), not
 * training norms. Event reminders (D−N) are computed in the EVENT's zone; the
 * first-analysis deadline in the organization's zone and working calendar.
 * Nothing is scheduled in the past: a past event creates no overdue reminder.
 */
import { addCalendarDays, isoWeekday, localDateTimeToUtc, localMidnightToUtc, todayLocalDate, utcToLocalDateTime, type LocalDate } from "./local-date";

export type FollowUpPolicyValues = {
  firstAnalysisBusinessDays: number;
  reminderDaysBefore: number[];
  workingDays: number[];
  timeZone: string;
  notifyCoordinationOnOverdue: boolean;
  /** SAM-61 — "aguardando registro" window after the scheduled time. */
  syncWindowHours: number;
  /** SAM-63 — training-load method (sRPE) when the organization chose one. */
  sessionLoadMethod: "SRPE" | null;
};

/** Defaults written in §7.2 when the organization configured nothing. */
export const DEFAULT_FOLLOW_UP_POLICY: FollowUpPolicyValues = {
  firstAnalysisBusinessDays: 2,
  reminderDaysBefore: [30, 14, 7, 1],
  workingDays: [1, 2, 3, 4, 5],
  timeZone: "America/Sao_Paulo",
  notifyCoordinationOnOverdue: false,
  syncWindowHours: 48,
  sessionLoadMethod: null,
};

/** Local time reminders fire at (a fixed product choice, in the relevant zone). */
export const REMINDER_LOCAL_TIME = "09:00";

/** `count` working days after `start` (0 = `start` itself); weekends follow the configured calendar. */
export function addBusinessDays(start: LocalDate, count: number, workingDays: readonly number[]): LocalDate {
  if (workingDays.length === 0) throw new RangeError("O calendário precisa de ao menos um dia útil.");
  let date = start;
  let remaining = count;
  while (remaining > 0) {
    date = addCalendarDays(date, 1);
    if (workingDays.includes(isoWeekday(date))) remaining -= 1;
  }
  return date;
}

/** "Primeira análise prevista até dd/mm": end of the N-th working day after registration, in the organization's zone. */
export function firstAnalysisDeadline(registeredAt: Date, policy: FollowUpPolicyValues): { dueLocalDate: LocalDate; dueAt: Date } {
  const start = todayLocalDate(registeredAt, policy.timeZone);
  const dueLocalDate = addBusinessDays(start, policy.firstAnalysisBusinessDays, policy.workingDays);
  return { dueLocalDate, dueAt: localMidnightToUtc(addCalendarDays(dueLocalDate, 1), policy.timeZone) };
}

type EventDates = { startLocalDate: LocalDate; endLocalDate: LocalDate | null; dateConfirmed: boolean; timeZone: string; status: string };

/** D−N reminders still in the future. None for an unconfirmed date or a cancelled event. */
export function eventReminderPlan(event: EventDates, daysBefore: readonly number[], now: Date): Array<{ daysBefore: number; dueAt: Date }> {
  if (!event.dateConfirmed || event.status === "CANCELLED") return [];
  return [...new Set(daysBefore)]
    .filter((days) => Number.isInteger(days) && days > 0)
    .sort((a, b) => b - a)
    .map((days) => ({ daysBefore: days, dueAt: localDateTimeToUtc(`${addCalendarDays(event.startLocalDate, -days)}T${REMINDER_LOCAL_TIME}`, event.timeZone) }))
    .filter((item) => item.dueAt > now);
}

/** "Resultado não registrado": the morning after the event ends, if that is still ahead. */
export function resultMissingAt(event: EventDates, now: Date): Date | null {
  if (!event.dateConfirmed || event.status === "CANCELLED") return null;
  const dueAt = localDateTimeToUtc(`${addCalendarDays(event.endLocalDate ?? event.startLocalDate, 1)}T${REMINDER_LOCAL_TIME}`, event.timeZone);
  return dueAt > now ? dueAt : null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * When an EXTERNAL notice may go out given the user's quiet hours ("HH:mm" in
 * their zone; the window may cross midnight). Inside the window it waits for
 * the end; the in-app notice is never delayed.
 */
export function deferForQuietHours(instant: Date, quietStart: string | null, quietEnd: string | null, timeZone: string): Date {
  if (!quietStart || !quietEnd || !HHMM.test(quietStart) || !HHMM.test(quietEnd) || quietStart === quietEnd) return instant;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const local = utcToLocalDateTime(instant, timeZone);
  const start = toMinutes(quietStart);
  const end = toMinutes(quietEnd);
  const crossesMidnight = start > end;
  const inside = crossesMidnight ? local.minutesOfDay >= start || local.minutesOfDay < end : local.minutesOfDay >= start && local.minutesOfDay < end;
  if (!inside) return instant;
  const endDate = crossesMidnight && local.minutesOfDay >= start ? addCalendarDays(local.date, 1) : local.date;
  return localDateTimeToUtc(`${endDate}T${quietEnd}`, timeZone);
}

/** Routine notices that may go to the daily summary instead of one by one (§7.3). */
export const ROUTINE_NOTICE_KINDS = ["UNPLANNED_ACTIVITY", "SESSION_WITHOUT_RECORD"] as const;
export function isRoutineNotice(kind: string): boolean {
  return (ROUTINE_NOTICE_KINDS as readonly string[]).includes(kind);
}
