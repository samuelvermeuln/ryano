/**
 * SAM-63 — weekly regularity (§17.4, AC12): four groups, never one "% done".
 *
 * Denominator = sessions that were due and are settled: full + partial +
 * without record + confirmed not done (justified included — it was not done,
 * with a reason). Outside it: cancelled by the coach, planned rest,
 * sessions in a registered unavailability, future ones and those still
 * "aguardando registro" inside the sync window. The original plan (every
 * prescription of the week, cancelled included) is kept for audit.
 */
import type { ExecutionState } from "./execution-state";

export type WeeklyRegularity = {
  full: number;
  partial: number;
  noRecord: number;
  notDoneConfirmed: number;
  /** Of `notDoneConfirmed`, how many came with a reason (JUSTIFIED). */
  justified: number;
  denominator: number;
  outside: { cancelled: number; rest: number; unavailable: number; awaitingRecord: number; future: number };
  originalPlan: number;
};

export function weeklyRegularity(states: readonly ExecutionState[]): WeeklyRegularity {
  const count = (state: ExecutionState) => states.filter((value) => value === state).length;
  const full = count("LINKED");
  const partial = count("PARTIAL");
  const noRecord = count("NO_RECORD");
  const justified = count("JUSTIFIED");
  const notDoneConfirmed = count("CONFIRMED_NOT_DONE") + justified;
  return {
    full,
    partial,
    noRecord,
    notDoneConfirmed,
    justified,
    denominator: full + partial + noRecord + notDoneConfirmed,
    outside: {
      cancelled: count("CANCELLED"),
      rest: count("REST"),
      unavailable: count("UNAVAILABLE"),
      awaitingRecord: count("AWAITING_RECORD"),
      future: count("FUTURE"),
    },
    originalPlan: states.length,
  };
}
