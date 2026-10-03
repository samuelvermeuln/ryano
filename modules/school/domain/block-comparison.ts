/**
 * SAM-72 — prescribed × executed by block and repetition (§17.2, §17.4,
 * §17.5, AC11).
 *
 * Layers: session → block → repetition. Each repetition is a lap aligned to
 * the snapshot structure (`alignStructure`); the samples inside its window
 * say how long the primary metric was measured and how long it stayed in the
 * band:
 *
 *   adherence = 100 × time measured inside the band / time with a valid sample
 *   coverage  = 100 × time with a valid sample / time of the evaluable blocks
 *
 * They always travel together: a high adherence never hides a low coverage.
 * Warm-up, cool-down and recoveries stay outside the main series (§14.4).
 * A block without samples is "não medido" and leaves the calculation; a
 * session without streams shows the limitation, never an estimated score.
 * The primary metric is the prescription's (explicit, or power → pace → heart
 * rate); secondary metrics are context and never fail a repetition (§17.5).
 */
import { AUXILIARY_BLOCK_TYPES, alignStructure, repetitionsOf, type StructuredBlock } from "./workout-structure";

export type PrimaryMetric = "power" | "pace" | "swimPace" | "heartRate";
export const PRIMARY_METRIC_LABELS: Record<PrimaryMetric, string> = {
  power: "Potência", pace: "Ritmo", swimPace: "Ritmo (natação)", heartRate: "Frequência cardíaca",
};

export type Band = { metric: PrimaryMetric; min: number; max: number; tolerancePct: number };

const num = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** The band the prescription asks for, in the metric's own unit (s/km, s/100 m, W, bpm). */
export function bandOf(payload: unknown): Band | null {
  if (!payload || typeof payload !== "object") return null;
  const target = payload as Record<string, unknown>;
  const tolerancePct = num(target, "tolerancePct") ?? 0;
  const range = (min: number | null, max: number | null, point: number | null) => {
    const low = min ?? point ?? max;
    const high = max ?? point ?? min;
    return low === null || high === null ? null : { min: Math.min(low, high), max: Math.max(low, high) };
  };
  const candidates: Record<PrimaryMetric, { min: number; max: number } | null> = {
    power: range(num(target, "powerMin"), num(target, "powerMax"), num(target, "power")),
    pace: range(num(target, "paceSecPerKmMin"), num(target, "paceSecPerKmMax"), num(target, "paceSecPerKm")),
    swimPace: range(num(target, "paceSec100mMin"), num(target, "paceSec100mMax"), num(target, "paceSec100m")),
    heartRate: range(num(target, "heartRateMin"), num(target, "heartRateMax"), null),
  };
  const chosen = target.primaryMetric as PrimaryMetric | undefined;
  const order: PrimaryMetric[] = chosen && candidates[chosen] ? [chosen] : ["power", "pace", "swimPace", "heartRate"];
  for (const metric of order) {
    const found = candidates[metric];
    if (found) return { metric, ...found, tolerancePct };
  }
  return null;
}

/** Pace is compared as speed (less time per distance = faster). */
const PACE_DISTANCE: Record<"pace" | "swimPace", number> = { pace: 1000, swimPace: 100 };

/** The band as accepted sample values: speed (m/s) for pace, the metric itself otherwise; tolerance widens both sides. */
function acceptance(band: Band) {
  const widen = band.tolerancePct / 100;
  if (band.metric === "pace" || band.metric === "swimPace") {
    const d = PACE_DISTANCE[band.metric];
    return { low: (d / band.max) * (1 - widen), high: (d / band.min) * (1 + widen) };
  }
  return { low: band.min * (1 - widen), high: band.max * (1 + widen) };
}

export type Direction = "INSIDE" | "FASTER" | "SLOWER" | "ABOVE" | "BELOW";
export const DIRECTION_LABELS: Record<Direction, string> = {
  INSIDE: "dentro da faixa", FASTER: "mais rápido que a faixa", SLOWER: "mais lento que a faixa", ABOVE: "acima da faixa", BELOW: "abaixo da faixa",
};

/** §17.5 — readable direction: a smaller pace is faster; more watts/bpm is above. */
export function directionOf(band: Band, measured: number): Direction {
  const widen = band.tolerancePct / 100;
  if (band.metric === "pace" || band.metric === "swimPace") {
    if (measured < band.min * (1 - widen)) return "FASTER";
    if (measured > band.max * (1 + widen)) return "SLOWER";
    return "INSIDE";
  }
  if (measured > band.max * (1 + widen)) return "ABOVE";
  if (measured < band.min * (1 - widen)) return "BELOW";
  return "INSIDE";
}

export type Streams = {
  time: number[];
  distance?: Array<number | null>;
  speed?: Array<number | null>;
  heartRate?: Array<number | null>;
  power?: Array<number | null>;
};

export type ComparisonLap = {
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate?: number | null;
  averagePower?: number | null;
};

/** The metric's value over the interval [i, i+1), or null when the sample is missing (a gap is never zero). */
function sampleValue(streams: Streams, metric: PrimaryMetric, index: number): number | null {
  if (metric === "power") return streams.power?.[index] ?? null;
  if (metric === "heartRate") return streams.heartRate?.[index] ?? null;
  const speed = streams.speed?.[index];
  if (typeof speed === "number") return speed;
  const d0 = streams.distance?.[index];
  const d1 = streams.distance?.[index + 1];
  const t0 = streams.time[index];
  const t1 = streams.time[index + 1];
  if (typeof d0 !== "number" || typeof d1 !== "number" || t0 === undefined || t1 === undefined || t1 <= t0) return null;
  return (d1 - d0) / (t1 - t0);
}

/** Seconds measured and seconds inside the band within [from, to). */
function windowTime(streams: Streams, band: Band, from: number, to: number) {
  const { low, high } = acceptance(band);
  let valid = 0;
  let inside = 0;
  const { time } = streams;
  for (let index = 0; index < time.length; index += 1) {
    const start = time[index]!;
    const end = time[index + 1] ?? start;
    const overlap = Math.min(end, to) - Math.max(start, from);
    if (overlap <= 0) continue;
    const value = sampleValue(streams, band.metric, index);
    if (value === null) continue;
    valid += overlap;
    if (value >= low && value <= high) inside += overlap;
  }
  return { valid, inside };
}

function lapAverage(lap: ComparisonLap, metric: PrimaryMetric): number | null {
  if (metric === "power") return lap.averagePower ?? null;
  if (metric === "heartRate") return lap.averageHeartRate ?? null;
  if (!lap.durationSeconds || !lap.distanceMeters) return null;
  return lap.durationSeconds / (lap.distanceMeters / PACE_DISTANCE[metric]);
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : null);

export type RepetitionComparison = {
  repetition: number | null;
  /** Seconds from the start of the activity (the aligned lap's start). */
  startSecond: number;
  durationSeconds: number;
  measured: number | null;
  direction: Direction | null;
  adherencePct: number | null;
  coveragePct: number | null;
  measuredSeconds: number;
  insideSeconds: number;
};

export type BlockComparison = {
  blockIndex: number;
  title: string | null;
  blockType: string;
  auxiliary: boolean;
  band: Band | null;
  repetitions: { planned: number; identified: number | null; confirmed: number | null; method: string | null };
  rows: RepetitionComparison[];
  adherencePct: number | null;
  coveragePct: number | null;
  notMeasured: boolean;
};

export type SessionBlockComparison = {
  aligned: boolean;
  hasStreams: boolean;
  blocks: BlockComparison[];
  main: { adherencePct: number | null; coveragePct: number | null; evaluableSeconds: number; measuredSeconds: number; insideSeconds: number };
  limitations: string[];
};

export function compareBlocks(input: {
  blocks: StructuredBlock[];
  laps: ComparisonLap[];
  streams: Streams | null;
  confirmedRepetitions?: Record<number, number>;
}): SessionBlockComparison {
  const { blocks, laps, streams } = input;
  const hasStreams = Boolean(streams && streams.time.length > 1);
  const segments = laps.length > 0 ? alignStructure(blocks, laps.length) : null;
  const limitations: string[] = [];
  if (!segments) limitations.push(laps.length === 0 ? "Sem voltas registradas: repetições não identificadas." : "As voltas do relógio não correspondem à estrutura prescrita: repetições não identificadas (volta automática não é repetição).");
  if (!hasStreams) limitations.push("Sem amostras da atividade: aderência e cobertura não calculadas — nunca estimadas.");

  const starts: number[] = [];
  laps.reduce((offset, lap) => { starts.push(offset); return offset + (lap.durationSeconds ?? 0); }, 0);

  const comparisons: BlockComparison[] = blocks.map((block, blockIndex) => {
    const band = bandOf(block.targetPayload);
    const auxiliary = AUXILIARY_BLOCK_TYPES.has(block.blockType);
    const rows: RepetitionComparison[] = [];
    if (segments) {
      segments.forEach((segment, index) => {
        if (segment.blockIndex !== blockIndex || segment.kind !== "work") return;
        const lap = laps[index]!;
        const duration = lap.durationSeconds ?? 0;
        const window = band && hasStreams ? windowTime(streams!, band, starts[index]!, starts[index]! + duration) : { valid: 0, inside: 0 };
        const measured = band ? lapAverage(lap, band.metric) : null;
        rows.push({
          repetition: segment.repetition,
          startSecond: starts[index]!,
          durationSeconds: duration,
          measured,
          direction: band && measured !== null ? directionOf(band, measured) : null,
          adherencePct: band && hasStreams ? pct(window.inside, window.valid) : null,
          coveragePct: band && hasStreams ? pct(window.valid, duration) : null,
          measuredSeconds: window.valid,
          insideSeconds: window.inside,
        });
      });
    }
    const evaluable = rows.reduce((sum, row) => sum + row.durationSeconds, 0);
    const measured = rows.reduce((sum, row) => sum + row.measuredSeconds, 0);
    const inside = rows.reduce((sum, row) => sum + row.insideSeconds, 0);
    return {
      blockIndex,
      title: block.title ?? null,
      blockType: block.blockType,
      auxiliary,
      band,
      repetitions: {
        planned: repetitionsOf(block),
        identified: segments ? rows.length : null,
        confirmed: input.confirmedRepetitions?.[blockIndex] ?? null,
        method: segments ? "voltas alinhadas à estrutura" : null,
      },
      rows,
      adherencePct: band && hasStreams ? pct(inside, measured) : null,
      coveragePct: band && hasStreams && segments ? pct(measured, evaluable) : null,
      notMeasured: Boolean(band && hasStreams && segments && measured === 0),
    };
  });

  // The main series: non-auxiliary blocks with a band and samples; "não medido" blocks leave the calculation.
  const main = comparisons.filter((block) => !block.auxiliary && block.band && !block.notMeasured);
  const evaluableSeconds = main.reduce((sum, block) => sum + block.rows.reduce((total, row) => total + row.durationSeconds, 0), 0);
  const measuredSeconds = main.reduce((sum, block) => sum + block.rows.reduce((total, row) => total + row.measuredSeconds, 0), 0);
  const insideSeconds = main.reduce((sum, block) => sum + block.rows.reduce((total, row) => total + row.insideSeconds, 0), 0);
  return {
    aligned: Boolean(segments),
    hasStreams,
    blocks: comparisons,
    main: {
      adherencePct: hasStreams && segments ? pct(insideSeconds, measuredSeconds) : null,
      coveragePct: hasStreams && segments ? pct(measuredSeconds, evaluableSeconds) : null,
      evaluableSeconds, measuredSeconds, insideSeconds,
    },
    limitations,
  };
}

/** "5:05 /km", "240 W", "152 bpm". */
export function formatMetric(metric: PrimaryMetric, value: number) {
  if (metric === "pace" || metric === "swimPace") {
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} ${metric === "pace" ? "/km" : "/100 m"}`;
  }
  return `${Math.round(value)} ${metric === "power" ? "W" : "bpm"}`;
}
