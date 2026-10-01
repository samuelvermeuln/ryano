/**
 * SAM-20 — training load estimated from heart rate (ADR-007).
 *
 * The product stores no per-second streams and no power for most athletes,
 * so the only load model it can state honestly is the heart-rate TSS
 * approximation (TrainingPeaks "hrTSS", as paraphrased by Intervals.icu):
 *
 *   hrTSS = hours × IF² × 100,  IF = %HRR(session average) ÷ %HRR(threshold)
 *   %HRR(x) = (x − resting) / (max − resting)      (Karvonen heart-rate reserve)
 *
 * One hour at the lactate threshold heart rate scores 100, by construction.
 * It needs the three sheet parameters (resting, threshold, maximum); with any
 * of them missing the number is not shown at all — a load without its
 * reference is a number the coach cannot act on. No CTL/ATL/TSB is derived
 * here: those need a continuous daily series longer than the windows the
 * screens show.
 *
 * Worked example (documented in the tests): resting 50, threshold 170,
 * max 190 → %HRR(170) = 0.857; a 60-minute session at 160 bpm → %HRR = 0.786,
 * IF = 0.917, hrTSS = 1 × 0.841 × 100 ≈ 84.
 */

export type HeartRateLoadParameters = {
  restingHeartRate: number | null;
  thresholdHeartRate: number | null;
  maxHeartRate: number | null;
};

export function canEstimateHeartRateLoad(params: HeartRateLoadParameters): boolean {
  const { restingHeartRate: rest, thresholdHeartRate: threshold, maxHeartRate: max } = params;
  return rest !== null && threshold !== null && max !== null
    && rest > 0 && max > rest && threshold > rest && threshold <= max;
}

/** hrTSS of one session, or null when the parameters or the session's average are missing. */
export function heartRateLoad(
  session: { durationSeconds: number | null; averageHeartRate: number | null },
  params: HeartRateLoadParameters,
): number | null {
  if (!canEstimateHeartRateLoad(params)) return null;
  if (!session.durationSeconds || session.durationSeconds <= 0 || !session.averageHeartRate) return null;
  const rest = params.restingHeartRate!;
  const reserve = params.maxHeartRate! - rest;
  const thresholdReserve = (params.thresholdHeartRate! - rest) / reserve;
  const sessionReserve = Math.max(0, (session.averageHeartRate - rest) / reserve);
  const intensity = sessionReserve / thresholdReserve;
  return Math.round((session.durationSeconds / 3600) * intensity * intensity * 100);
}
