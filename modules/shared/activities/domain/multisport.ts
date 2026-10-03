/**
 * SAM-75 — triathlon and multisport (§16, §17.3, §21.1, §22.5, AC13).
 *
 * - Segments of a parent activity: the provider's legs (with T1/T2 read from
 *   the gaps between legs), or trechos selected by the athlete or the coach.
 *   Distances keep their own modality and are never summed across sports
 *   (§21.2); durations may be summed with a legend.
 * - Per-sport copies of the same multisport session are children of the
 *   parent (`parentActivityId`), or mirrors from another connection
 *   (`duplicateOfActivityId`): either way they count ONCE (AC13).
 * - Nothing here merges activities: a relation comes from the provider or
 *   from an explicit selection, never from similarity (ADR-003).
 * - A brick is an ordered chain of sessions; the real interval between legs
 *   is reported, and a run hours after the ride is a separate session, not
 *   an immediate transition (§16.3).
 */
import { z } from "zod";

export const SEGMENT_KINDS = ["SWIM", "T1", "BIKE", "T2", "RUN", "OTHER"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];
export const SEGMENT_LABELS: Record<SegmentKind, string> = { SWIM: "Natação", T1: "T1", BIKE: "Ciclismo", T2: "T2", RUN: "Corrida", OTHER: "Outro" };

export const SEGMENT_ORIGINS = ["PROVIDER", "ATHLETE_SELECTION", "COACH_SELECTION"] as const;
export type SegmentOrigin = (typeof SEGMENT_ORIGINS)[number];

export type ActivitySegmentView = {
  order: number;
  kind: SegmentKind;
  sportType: string | null;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  durationSeconds: number;
  distanceMeters: number | null;
  origin: SegmentOrigin;
  label: string | null;
};

const SPORT_OF_KIND: Record<SegmentKind, string | null> = { SWIM: "swim", BIKE: "bike", RUN: "run", T1: null, T2: null, OTHER: null };

export function kindOfSport(sport: string | null | undefined): SegmentKind {
  const text = (sport ?? "").toLowerCase();
  if (/swim|nata|open/.test(text)) return "SWIM";
  if (/bike|cycl|ride|cicl/.test(text)) return "BIKE";
  if (/run|corr/.test(text)) return "RUN";
  if (/transition|t1|t2/.test(text)) return "T1";
  return "OTHER";
}

export type ProviderLeg = { sport: string | null; startOffsetSeconds: number; durationSeconds: number; distanceMeters: number | null };

/**
 * The provider's legs in order; a gap between two legs is the transition
 * (T1 after the swim, T2 after the bike). Legs the provider already labels
 * as transitions keep their place.
 */
export function segmentsFromProviderLegs(legs: ProviderLeg[]): ActivitySegmentView[] {
  const sorted = [...legs].sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds);
  const segments: ActivitySegmentView[] = [];
  let transitions = 0;
  sorted.forEach((leg, index) => {
    const previous = sorted[index - 1];
    const previousEnd = previous ? previous.startOffsetSeconds + previous.durationSeconds : null;
    let kind = kindOfSport(leg.sport);
    if (kind === "T1") kind = transitions === 0 ? "T1" : "T2";
    if (previousEnd !== null && kind !== "T1" && kind !== "T2" && leg.startOffsetSeconds - previousEnd > 0) {
      transitions += 1;
      segments.push({
        order: segments.length + 1, kind: transitions === 1 ? "T1" : "T2", sportType: null,
        startOffsetSeconds: previousEnd, endOffsetSeconds: leg.startOffsetSeconds, durationSeconds: leg.startOffsetSeconds - previousEnd, distanceMeters: null, origin: "PROVIDER", label: null,
      });
    }
    if (kind === "T1" || kind === "T2") transitions += 1;
    segments.push({
      order: segments.length + 1, kind, sportType: SPORT_OF_KIND[kind] ?? leg.sport,
      startOffsetSeconds: leg.startOffsetSeconds, endOffsetSeconds: leg.startOffsetSeconds + leg.durationSeconds, durationSeconds: leg.durationSeconds,
      distanceMeters: kind === "T1" || kind === "T2" ? null : leg.distanceMeters, origin: "PROVIDER", label: null,
    });
  });
  return segments;
}

/** Garmin's typed splits as persisted in `metrics.garminActivityDetails.typedSplits` (paraphrased field names). */
export function legsFromGarminTypedSplits(metrics: unknown): ProviderLeg[] {
  const splits = (metrics as { garminActivityDetails?: { typedSplits?: unknown[] } } | null)?.garminActivityDetails?.typedSplits;
  if (!Array.isArray(splits)) return [];
  let offset = 0;
  const legs: ProviderLeg[] = [];
  for (const row of splits as Array<Record<string, unknown>>) {
    const sport = String(row.sportType ?? row.typeKey ?? row.splitType ?? (row.activityType as { typeKey?: string } | undefined)?.typeKey ?? "");
    const duration = Number(row.elapsedDuration ?? row.duration ?? row.totalElapsedTime ?? 0);
    const distance = row.distance ?? row.distanceMeters ?? row.totalDistance;
    const start = typeof row.startTimeOffsetSeconds === "number" ? row.startTimeOffsetSeconds : offset;
    if (!Number.isFinite(duration) || duration <= 0) continue;
    legs.push({ sport, startOffsetSeconds: start, durationSeconds: duration, distanceMeters: typeof distance === "number" ? distance : null });
    offset = start + duration;
  }
  return legs;
}

/** Durations may be summed with a legend; distances stay per modality (§21.2). */
export function segmentTotals(segments: ActivitySegmentView[]) {
  const bySport: Record<string, { seconds: number; meters: number | null }> = {};
  let transitionSeconds = 0;
  for (const segment of segments) {
    if (segment.kind === "T1" || segment.kind === "T2") { transitionSeconds += segment.durationSeconds; continue; }
    const key = segment.sportType ?? segment.kind;
    const current = bySport[key] ?? { seconds: 0, meters: null };
    current.seconds += segment.durationSeconds;
    if (segment.distanceMeters !== null) current.meters = (current.meters ?? 0) + segment.distanceMeters;
    bySport[key] = current;
  }
  return { bySport, transitionSeconds, totalSeconds: segments.reduce((sum, segment) => sum + segment.durationSeconds, 0), legend: "Duração total soma as modalidades e as transições; distâncias não são somadas entre modalidades." };
}

export type CountableActivity = { id: string; durationSeconds: number | null; movingSeconds?: number | null; duplicateOfActivityId: string | null; parentActivityId: string | null };

/** AC13 — the athlete's totals: mirrors and per-sport copies of a parent are left out. */
export function countOnce<T extends CountableActivity>(activities: T[]): T[] {
  return activities.filter((activity) => activity.duplicateOfActivityId === null && activity.parentActivityId === null);
}

export function weeklySecondsCountedOnce(activities: CountableActivity[]) {
  return countOnce(activities).reduce((sum, activity) => sum + (activity.movingSeconds ?? activity.durationSeconds ?? 0), 0);
}

export const selectionSchema = z.strictObject({
  startOffsetSeconds: z.number().int().min(0),
  endOffsetSeconds: z.number().int().positive(),
  kind: z.enum(SEGMENT_KINDS).default("OTHER"),
  label: z.string().trim().max(120).nullish().transform((value) => value || null),
}).refine((value) => value.endOffsetSeconds > value.startOffsetSeconds, { message: "O trecho termina antes de começar.", path: ["endOffsetSeconds"] });
export type SelectionInput = z.infer<typeof selectionSchema>;

/**
 * §17.3 — selecting trechos of one file for one or two prescriptions: the
 * ranges must fit the activity and never overlap, so no second is counted
 * twice. Returns the seconds each selection covers.
 */
export function validateSelections(durationSeconds: number, existing: Array<{ startOffsetSeconds: number; endOffsetSeconds: number }>, next: SelectionInput[]) {
  const all = [...existing, ...next].sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds);
  for (const range of next) {
    if (range.endOffsetSeconds > durationSeconds) return { ok: false as const, reason: `O trecho passa do fim da atividade (${durationSeconds} s).` };
  }
  for (let index = 1; index < all.length; index += 1) {
    if (all[index]!.startOffsetSeconds < all[index - 1]!.endOffsetSeconds) return { ok: false as const, reason: "Os trechos se sobrepõem: os mesmos segundos não podem contar duas vezes." };
  }
  return { ok: true as const, coveredSeconds: next.reduce((sum, range) => sum + (range.endOffsetSeconds - range.startOffsetSeconds), 0) };
}

export type BrickLeg = { order: number; title: string; sportType: string; startedAt: Date | null; durationSeconds: number | null; executed: boolean };

/** Minutes between legs above which the next leg is a separate session, not an immediate transition (§16.3). */
export const BRICK_IMMEDIATE_MINUTES = 30;

/** The chain as executed: order, real interval between legs, and whether each interval reads as a transition. */
export function brickComparison(legs: BrickLeg[], immediateMinutes = BRICK_IMMEDIATE_MINUTES) {
  const ordered = [...legs].sort((a, b) => a.order - b.order);
  const rows = ordered.map((leg, index) => {
    const previous = ordered[index - 1];
    const previousEnd = previous?.startedAt && previous.durationSeconds !== null ? new Date(previous.startedAt.getTime() + previous.durationSeconds * 1000) : null;
    const intervalSeconds = previousEnd && leg.startedAt ? Math.max(0, Math.round((leg.startedAt.getTime() - previousEnd.getTime()) / 1000)) : null;
    return {
      ...leg,
      intervalSeconds,
      intervalLabel: intervalSeconds === null ? (index === 0 ? null : "intervalo não medido") : intervalSeconds <= immediateMinutes * 60 ? "transição" : "sessão separada (horas depois)",
    };
  });
  const executed = rows.filter((row) => row.executed && row.durationSeconds !== null);
  const first = executed[0]?.startedAt ?? null;
  const last = executed[executed.length - 1];
  const elapsed = first && last?.startedAt && last.durationSeconds !== null ? Math.round((last.startedAt.getTime() + last.durationSeconds * 1000 - first.getTime()) / 1000) : null;
  return { rows, elapsedSeconds: elapsed, elapsedLegend: "Total decorrido do início da primeira etapa ao fim da última, incluindo os intervalos." };
}
