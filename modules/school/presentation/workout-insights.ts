/**
 * SAM-17 — what the coach reads from the activity behind an execution: time in
 * zones, laps, and the lap-by-block overlay against the prescription.
 *
 * Pure and provider-agnostic: the input is the `ActivityVisualData` contract
 * every provider module already produces (bars for zones, numeric `laps`) plus
 * the prescribed blocks; nothing here knows Garmin from Strava. Nothing is
 * invented either — a section comes back empty when the provider sent nothing,
 * and the overlay is `null` (with the reason) when the number of laps does not
 * match the structure, instead of a forced alignment.
 */
import { formatDistance, formatDuration, formatHeartRate, formatPace, formatPower, formatSwimPace } from "@/lib/format";
import type { ActivityLap, ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import { describeBlockTargets } from "./workout-blocks";
import { restDurationSeconds } from "./workout-summary";

export type InsightBlock = {
  id: string;
  blockType: string;
  title: string | null;
  durationS: number | null;
  distanceM: number | null;
  repetitions: number | null;
  targetPayload: unknown;
  restPayload: unknown;
};

export type ZoneBar = {
  label: string;
  valueText: string;
  /** Fraction of the section's total time, 0–1; null when the provider sent no numeric time. */
  share: number | null;
  ratio: number;
  color: string;
};

export type ZoneSection = {
  id: string;
  title: string;
  description: string;
  approximate: boolean;
  disclaimer: string | null;
  items: ZoneBar[];
};

export type LapRow = {
  index: number;
  label: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  /** Seconds per km (or per 100 m for swimming), derived from speed or distance/duration. */
  paceSeconds: number | null;
  paceLabel: string;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averagePower: number | null;
  /** Relative length of the bar (by duration, else distance), 0–1. */
  ratio: number;
  /** True when the overlay mapped this lap to a rest segment of the prescription. */
  isRecovery: boolean;
};

export type OverlayVerdict = "within" | "below" | "above" | "unknown";

export type OverlayRow = {
  segment: number;
  blockIndex: number;
  blockTitle: string;
  repetition: number | null;
  kind: "work" | "rest";
  lapIndex: number;
  prescribed: {
    durationS: number | null;
    distanceM: number | null;
    targets: string[];
  };
  actual: {
    durationSeconds: number | null;
    distanceMeters: number | null;
    paceSeconds: number | null;
    paceLabel: string;
    averageHeartRate: number | null;
    averagePower: number | null;
  };
  /** Which dimension decided the verdict, for the legend. */
  basis: "heartRate" | "pace" | "power" | null;
  verdict: OverlayVerdict;
};

export type WorkoutInsights = {
  zones: ZoneSection[];
  laps: LapRow[];
  overlay: OverlayRow[] | null;
  /** Why there is no overlay, when `overlay` is null and laps exist. */
  overlayNote: string | null;
};

const PACE_TOLERANCE = 0.05;
const POWER_TOLERANCE = 0.05;

function number(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function withoutDuration(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const { durationS: _duration, ...rest } = payload as Record<string, unknown>;
  void _duration;
  return rest;
}

function isSwim(sportType: string | null): boolean {
  return (sportType ?? "").toLowerCase().includes("swim");
}

/** Pace of a lap, from speed when the provider sent it, else from distance/duration. Per 100 m for swimming. */
export function lapPaceSeconds(lap: ActivityLap, swim: boolean): number | null {
  const unit = swim ? 100 : 1000;
  if (lap.averageSpeed && lap.averageSpeed > 0) return unit / lap.averageSpeed;
  if (lap.distanceMeters && lap.durationSeconds && lap.distanceMeters > 0) {
    return lap.durationSeconds / (lap.distanceMeters / unit);
  }
  return null;
}

function paceLabel(paceSeconds: number | null, swim: boolean): string {
  return swim ? formatSwimPace(paceSeconds) : formatPace(paceSeconds);
}

export function buildZoneSections(visualData: ActivityVisualData): ZoneSection[] {
  return visualData.barSections
    .filter((section) => section.id === "heart-rate-zones" || section.id === "power-zones")
    .map((section) => {
      const total = section.items.reduce((sum, item) => sum + (item.seconds ?? 0), 0);
      const hasSeconds = section.items.every((item) => typeof item.seconds === "number");
      return {
        id: section.id,
        title: section.title,
        description: section.description,
        approximate: section.approximate === true,
        disclaimer: section.disclaimer ?? null,
        items: section.items.map((item) => ({
          label: item.label,
          valueText: item.valueText,
          share: hasSeconds && total > 0 ? (item.seconds ?? 0) / total : null,
          ratio: item.ratio,
          color: item.color,
        })),
      };
    })
    .filter((section) => section.items.length > 0);
}

export function buildLapRows(laps: readonly ActivityLap[], sportType: string | null, recoveryIndexes: ReadonlySet<number>): LapRow[] {
  const swim = isSwim(sportType);
  const magnitudes = laps.map((lap) => lap.durationSeconds ?? lap.distanceMeters ?? 0);
  const max = Math.max(...magnitudes, 1);
  return laps.map((lap, position) => {
    const pace = lapPaceSeconds(lap, swim);
    return {
      index: lap.index,
      label: `${swim ? "Volta" : "Lap"} ${lap.index}`,
      durationSeconds: lap.durationSeconds,
      distanceMeters: lap.distanceMeters,
      paceSeconds: pace,
      paceLabel: paceLabel(pace, swim),
      averageHeartRate: lap.averageHeartRate,
      maxHeartRate: lap.maxHeartRate,
      averagePower: lap.averagePower,
      ratio: Math.max((magnitudes[position] ?? 0) / max, 0.04),
      isRecovery: recoveryIndexes.has(lap.index),
    };
  });
}

type Segment = {
  blockIndex: number;
  blockTitle: string;
  repetition: number | null;
  kind: "work" | "rest";
  durationS: number | null;
  distanceM: number | null;
  payload: unknown;
};

/**
 * The prescription as the sequence of efforts a watch would record as laps.
 * Three readings are tried, in order of how coaches usually press the lap
 * button: rest after every repetition except the block's last, rest after
 * every repetition, and work segments only.
 */
export function expandBlocks(blocks: readonly InsightBlock[]): Segment[][] {
  const build = (restMode: "between" | "after-each" | "none"): Segment[] => {
    const segments: Segment[] = [];
    blocks.forEach((block, blockIndex) => {
      const reps = block.repetitions && block.repetitions > 1 ? block.repetitions : 1;
      const rest = restDurationSeconds(block.restPayload);
      const title = block.title ?? block.blockType;
      for (let repetition = 1; repetition <= reps; repetition += 1) {
        segments.push({
          blockIndex, blockTitle: title, repetition: reps > 1 ? repetition : null, kind: "work",
          durationS: block.durationS, distanceM: block.distanceM, payload: block.targetPayload,
        });
        const wantsRest = restMode === "after-each" || (restMode === "between" && repetition < reps);
        if (rest !== null && wantsRest) {
          segments.push({
            blockIndex, blockTitle: title, repetition: reps > 1 ? repetition : null, kind: "rest",
            durationS: rest, distanceM: null, payload: block.restPayload,
          });
        }
      }
    });
    return segments;
  };
  const candidates = [build("between"), build("after-each"), build("none")];
  // Dedupe identical readings (blocks without rest produce the same list three times).
  return candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.length === candidate.length
      && other.every((segment, position) => segment.kind === candidate[position].kind)) === index);
}

function verdictFor(segment: Segment, lap: ActivityLap, swim: boolean): Pick<OverlayRow, "basis" | "verdict"> {
  const hrMin = number(segment.payload, "heartRateMin");
  const hrMax = number(segment.payload, "heartRateMax");
  if ((hrMin !== null || hrMax !== null) && lap.averageHeartRate !== null) {
    if (hrMin !== null && lap.averageHeartRate < hrMin) return { basis: "heartRate", verdict: "below" };
    if (hrMax !== null && lap.averageHeartRate > hrMax) return { basis: "heartRate", verdict: "above" };
    return { basis: "heartRate", verdict: "within" };
  }
  const targetPace = swim ? number(segment.payload, "paceSec100m") : number(segment.payload, "paceSecPerKm");
  const pace = lapPaceSeconds(lap, swim);
  if (targetPace !== null && pace !== null) {
    // A slower pace (more seconds) is a lower intensity than prescribed.
    if (pace > targetPace * (1 + PACE_TOLERANCE)) return { basis: "pace", verdict: "below" };
    if (pace < targetPace * (1 - PACE_TOLERANCE)) return { basis: "pace", verdict: "above" };
    return { basis: "pace", verdict: "within" };
  }
  const targetPower = number(segment.payload, "power");
  if (targetPower !== null && lap.averagePower !== null) {
    if (lap.averagePower < targetPower * (1 - POWER_TOLERANCE)) return { basis: "power", verdict: "below" };
    if (lap.averagePower > targetPower * (1 + POWER_TOLERANCE)) return { basis: "power", verdict: "above" };
    return { basis: "power", verdict: "within" };
  }
  return { basis: null, verdict: "unknown" };
}

/** Aligns laps to the prescription when one of the structure readings has exactly as many segments. */
export function buildOverlay(
  blocks: readonly InsightBlock[],
  laps: readonly ActivityLap[],
  sportType: string | null,
): { rows: OverlayRow[] | null; note: string | null } {
  if (blocks.length === 0 || laps.length === 0) return { rows: null, note: null };
  const readings = expandBlocks(blocks);
  const segments = readings.find((candidate) => candidate.length === laps.length);
  if (!segments) {
    const counts = [...new Set(readings.map((candidate) => candidate.length))].sort((a, b) => a - b);
    return {
      rows: null,
      note: `A estrutura prescrita tem ${counts.join(" ou ")} segmento(s) e a atividade registrou ${laps.length} lap(s): sem correspondência bloco a bloco.`,
    };
  }
  const swim = isSwim(sportType);
  const rows = segments.map((segment, position): OverlayRow => {
    const lap = laps[position];
    const pace = lapPaceSeconds(lap, swim);
    return {
      segment: position + 1,
      blockIndex: segment.blockIndex,
      blockTitle: segment.blockTitle,
      repetition: segment.repetition,
      kind: segment.kind,
      lapIndex: lap.index,
      prescribed: {
        durationS: segment.durationS,
        distanceM: segment.distanceM,
        // The rest length is already the segment's `durationS`; keep only intensity targets.
        targets: describeBlockTargets(withoutDuration(segment.payload)),
      },
      actual: {
        durationSeconds: lap.durationSeconds,
        distanceMeters: lap.distanceMeters,
        paceSeconds: pace,
        paceLabel: paceLabel(pace, swim),
        averageHeartRate: lap.averageHeartRate,
        averagePower: lap.averagePower,
      },
      ...verdictFor(segment, lap, swim),
    };
  });
  return { rows, note: null };
}

export function buildWorkoutInsights(
  visualData: ActivityVisualData | null,
  blocks: readonly InsightBlock[],
  sportType: string | null,
): WorkoutInsights | null {
  if (!visualData) return null;
  const laps = visualData.laps ?? [];
  const overlay = buildOverlay(blocks, laps, sportType);
  const recovery = new Set((overlay.rows ?? []).filter((row) => row.kind === "rest").map((row) => row.lapIndex));
  const insights: WorkoutInsights = {
    zones: buildZoneSections(visualData),
    laps: buildLapRows(laps, sportType, recovery),
    overlay: overlay.rows,
    overlayNote: overlay.note,
  };
  return insights.zones.length === 0 && insights.laps.length === 0 ? null : insights;
}

/** Labels shared by the lap table and the overlay legend. */
export const OVERLAY_VERDICT_LABELS: Record<OverlayVerdict, string> = {
  within: "Na faixa",
  below: "Abaixo",
  above: "Acima",
  unknown: "Sem alvo comparável",
};

export function formatLapCells(row: Pick<LapRow, "durationSeconds" | "distanceMeters" | "averageHeartRate" | "maxHeartRate" | "averagePower">) {
  return {
    duration: formatDuration(row.durationSeconds),
    distance: formatDistance(row.distanceMeters),
    heartRate: row.averageHeartRate === null && row.maxHeartRate === null
      ? "—"
      : `${formatHeartRate(row.averageHeartRate)}${row.maxHeartRate !== null ? ` / ${formatHeartRate(row.maxHeartRate)}` : ""}`,
    power: formatPower(row.averagePower),
  };
}
