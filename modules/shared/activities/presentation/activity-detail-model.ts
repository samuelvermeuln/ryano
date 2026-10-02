/**
 * SAM-40 — the view-model of the shared activity screen (athlete, coach,
 * school). Pure and serialisable (client components receive it as props), so
 * formats are identifiers resolved by `formatSeriesValue`, never functions.
 *
 * Inputs:
 * - the persisted `Activity` row (aggregates + the SAM-38 extended stats);
 * - the legacy `ActivityVisualData` of that activity (adaptive KPIs/summary by
 *   `METRIC_DISPLAY_RULES`, plus the provider enrichment: approximate zones,
 *   splits, workout analysis) — the per-activity fallback while the rich
 *   detail has not been ingested;
 * - the resolved rich detail (`resolveActivityDetailSources`, SAM-45) when it
 *   exists: laps, zone sets, streams, each block labelled with its source.
 *
 * Rules: absence is never zero (a null stat has no row, a column no cell
 * shows "—"); proprietary values keep the provider's label; nothing here
 * decides by provider id — only by what the DTO carries and by the sport's
 * display rules.
 */
import type { Activity } from "@prisma/client";
import {
  formatCadence,
  formatCalories,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import { humanizeActivityLabel } from "@/lib/activity-text";
import type { MetricSource, NormalizedActivityDetail, NormalizedLap, NormalizedZoneSet } from "../contracts/rich";
import { METRIC_DISPLAY_RULES, getMetricDisplayCategory, type MetricDisplayRules } from "../metric-display-categories";
import type { ResolvedActivityDetailSources } from "../source-resolution";
import { isRyvanoSportType } from "../sport-types";
import type { ActivityHeroStat, ActivityLap, ActivityMetricRow, ActivityMetricSection, ActivityVisualData } from "./activity-visual-data";
import { decodePolyline, type LatLng } from "./polyline";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type SeriesFormat = "pace" | "swimPace" | "kmh" | "bpm" | "rpm" | "spm" | "watts" | "celsius" | "meters";

export type TimelineSeries = {
  key: "pace" | "speed" | "heartRate" | "cadence" | "strokeRate" | "power" | "temperature" | "altitude";
  label: string;
  format: SeriesFormat;
  /** Lower is better (pace): the chart draws the axis inverted. */
  inverted: boolean;
  values: (number | null)[];
  colorVar: string;
};

export type ActivityTimeline = {
  /** Seconds since start, one per sample. */
  time: number[];
  /** Metres, aligned to `time`; null when the provider sent no distance series. */
  distance: (number | null)[] | null;
  series: TimelineSeries[];
  sourceNote: string;
};

export type ActivityRoute = {
  points: LatLng[];
  /** True when `points[i]` is the sample `i` of the timeline (hover sync). */
  alignedToTimeline: boolean;
};

export type StatRow = { label: string; value: string; note?: string };
export type StatGroup = { id: string; title: string; rows: StatRow[]; sourceNote?: string };

export type LapColumn = { key: string; label: string; align?: "left" | "right" };
export type LapRow = { number: string; cells: Record<string, string> };
export type LapsModel = {
  vocabulary: "lap" | "split";
  columns: LapColumn[];
  rows: LapRow[];
  summary: LapRow;
  sourceNote: string;
};

export type ZoneItem = { label: string; seconds: number; ratio: number; shareText: string; valueText: string };
export type ZoneSetModel = {
  id: string;
  title: string;
  sourceNote: string;
  approximate: boolean;
  items: ZoneItem[];
};

export type ActivityFeedbackModel = { rpe: number; mood: number | null; energy: number | null; comment: string | null };

export type ActivityDetailModel = {
  activityId: string;
  header: {
    title: string;
    /** The editorial title the athlete may edit (null = none yet). */
    editorialTitle: string | null;
    sportLabel: string;
    subSportType: string | null;
    providerId: string;
    providerLabel: string;
    startedAtLabel: string;
    kpis: ActivityHeroStat[];
  };
  route: ActivityRoute | null;
  timeline: ActivityTimeline | null;
  stats: StatGroup[];
  laps: LapsModel | null;
  zones: ZoneSetModel[];
  analysis: ActivityMetricSection[];
  feedback: ActivityFeedbackModel | null;
  /** "Voltas: Garmin · nativas" — one entry per rich block shown. */
  sources: string[];
};

export type ActivityDetailModelInput = {
  activity: Activity;
  visualData: ActivityVisualData;
  rich: ResolvedActivityDetailSources | null;
  feedback?: { rpe: number; mood: number | null; energy: number | null; comment: string | null } | null;
  /** Provider id → display name (catalog); the model never imports the catalog. */
  providerLabel: (providerId: string) => string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DASH = "—";

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positive(value: number | null | undefined): number | null {
  const parsed = num(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function rulesFor(sportKey: string): MetricDisplayRules {
  const key = sportKey.trim().toLowerCase();
  return METRIC_DISPLAY_RULES[isRyvanoSportType(key) ? getMetricDisplayCategory(key) : "default"];
}

function paceFromSpeed(speed: number | null, pace: MetricDisplayRules["pace"]): number | null {
  const value = positive(speed);
  if (!pace || value === null) return null;
  return (pace === "pace-per-100m" ? 100 : 1000) / value;
}

function formatPaceByRules(seconds: number, pace: MetricDisplayRules["pace"]): string {
  return pace === "pace-per-100m" ? formatSwimPace(seconds) : formatPace(seconds);
}

export function sourceLabel(source: MetricSource, providerLabel: (id: string) => string): string {
  return source.kind === "derived" ? `estimado pela Ryvano a partir dos dados ${providerLabel(source.provider)}` : `${providerLabel(source.provider)} · nativo`;
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function formatCelsius(value: number): string {
  return `${Math.round(value * 10) / 10} °C`;
}

function formatMillilitres(value: number): string {
  return `${Math.round(value)} ml`;
}

function formatEffect(value: number, label: string | null): string {
  const rounded = Math.round(value * 10) / 10;
  return label ? `${rounded} · ${label}` : String(rounded);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function buildKpis(visualData: ActivityVisualData): ActivityHeroStat[] {
  const kpis = visualData.heroStats.slice(0, 4);
  for (const row of visualData.overviewMetrics) {
    if (kpis.length >= 4) break;
    if (row.value === DASH || kpis.some((kpi) => kpi.label === row.label)) continue;
    kpis.push({ label: row.label, value: row.value, tone: "text-foreground" });
  }
  return kpis;
}

// ---------------------------------------------------------------------------
// Route + timeline
// ---------------------------------------------------------------------------

function buildRoute(activity: Activity, rich: ResolvedActivityDetailSources | null): ActivityRoute | null {
  const latlng = rich?.streams.find((stream) => stream.key === "latlng");
  if (latlng) {
    const points = latlng.values.map((value) => (Array.isArray(value) ? ([value[0], value[1]] as LatLng) : null));
    if (points.some((point) => point !== null)) {
      // Keep alignment: a gap stays a gap (the chart hover simply has no point there).
      return { points: points.map((point) => point ?? [Number.NaN, Number.NaN]), alignedToTimeline: true };
    }
  }
  if (activity.routePolyline) {
    const points = decodePolyline(activity.routePolyline);
    if (points.length > 1) return { points, alignedToTimeline: false };
  }
  return null;
}

const SERIES_SPECS: Array<{
  streamKey: NormalizedActivityDetail["streams"][number]["key"];
  key: TimelineSeries["key"];
  label: string;
  format: SeriesFormat;
  colorVar: string;
  when?: (rules: MetricDisplayRules) => boolean;
}> = [
  { streamKey: "heartRate", key: "heartRate", label: "Frequência cardíaca", format: "bpm", colorVar: "--chart-heart-rate" },
  { streamKey: "cadence", key: "cadence", label: "Cadência", format: "rpm", colorVar: "--chart-cadence", when: (rules) => rules.cadenceOrStrokeRate === "cadence" },
  { streamKey: "strokeRate", key: "strokeRate", label: "Frequência de braçadas", format: "spm", colorVar: "--chart-cadence", when: (rules) => rules.cadenceOrStrokeRate === "stroke-rate" },
  { streamKey: "power", key: "power", label: "Potência", format: "watts", colorVar: "--chart-power" },
  { streamKey: "temperature", key: "temperature", label: "Temperatura", format: "celsius", colorVar: "--chart-temperature" },
  { streamKey: "altitude", key: "altitude", label: "Altitude", format: "meters", colorVar: "--chart-altitude" },
];

function numericValues(values: unknown[]): (number | null)[] {
  return values.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null));
}

function buildTimeline(rich: ResolvedActivityDetailSources | null, rules: MetricDisplayRules, providerLabel: (id: string) => string): ActivityTimeline | null {
  if (!rich) return null;
  const timeStream = rich.streams.find((stream) => stream.key === "time");
  if (!timeStream) return null;
  const time = numericValues(timeStream.values).map((value, index) => value ?? index);
  const distanceStream = rich.streams.find((stream) => stream.key === "distance");
  const distance = distanceStream ? numericValues(distanceStream.values) : null;
  const series: TimelineSeries[] = [];

  const speed = rich.streams.find((stream) => stream.key === "speed");
  if (speed) {
    const speeds = numericValues(speed.values);
    if (rules.pace) {
      series.push({
        key: "pace", label: rules.pace === "pace-per-100m" ? "Ritmo (/100 m)" : "Ritmo (/km)",
        format: rules.pace === "pace-per-100m" ? "swimPace" : "pace", inverted: true, colorVar: "--chart-pace",
        values: speeds.map((value) => paceFromSpeed(value, rules.pace)),
      });
    } else if (rules.speedFallback) {
      series.push({
        key: "speed", label: "Velocidade", format: "kmh", inverted: false, colorVar: "--chart-pace",
        values: speeds.map((value) => (value === null ? null : value * 3.6)),
      });
    }
  }

  for (const spec of SERIES_SPECS) {
    if (spec.when && !spec.when(rules)) continue;
    const stream = rich.streams.find((candidate) => candidate.key === spec.streamKey);
    if (!stream) continue;
    const values = numericValues(stream.values);
    if (!values.some((value) => value !== null)) continue;
    series.push({ key: spec.key, label: spec.label, format: spec.format, inverted: false, colorVar: spec.colorVar, values });
  }

  if (series.length === 0) return null;
  const source = rich.sources.streams;
  return { time, distance, series, sourceNote: source ? `Séries: ${sourceLabel(source, providerLabel)}` : "" };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function rows(entries: Array<StatRow | null>): StatRow[] {
  return entries.filter((row): row is StatRow => row !== null);
}

function row(label: string, value: string | null, note?: string): StatRow | null {
  return value === null ? null : { label, value, ...(note ? { note } : {}) };
}

function buildStats(activity: Activity, visualData: ActivityVisualData, rules: MetricDisplayRules, providerLabel: string): StatGroup[] {
  const groups: StatGroup[] = [];
  if (visualData.overviewMetrics.length > 0) {
    groups.push({ id: "summary", title: "Resumo do treino", rows: visualData.overviewMetrics.filter((metric) => metric.value !== DASH) });
  }

  const timer = positive(activity.timerSeconds);
  const elapsed = positive(activity.elapsedSeconds);
  const timeRows = rows([
    row("Tempo de timer", timer === null ? null : formatDuration(timer)),
    row("Tempo transcorrido", elapsed === null ? null : formatDuration(elapsed)),
  ]);
  if (timeRows.length > 0) groups.push({ id: "time", title: "Tempo", rows: timeRows });

  const avgHr = positive(activity.averageHeartRate);
  const maxHr = positive(activity.maxHeartRate);
  const hrRows = rows([
    row("FC média em % da máxima", avgHr !== null && maxHr !== null ? `${Math.round((avgHr / maxHr) * 100)}%` : null),
  ]);
  if (hrRows.length > 0) groups.push({ id: "heart-rate", title: "Frequência cardíaca", rows: hrRows });

  const energyImpact = num(activity.energyImpact);
  const energyRows = rows([
    row("Calorias ativas", positive(activity.caloriesActive) === null ? null : formatCalories(activity.caloriesActive)),
    row("Calorias em repouso", positive(activity.caloriesResting) === null ? null : formatCalories(activity.caloriesResting)),
    row("Perda de suor estimada", positive(activity.estimatedSweatLossMl) === null ? null : formatMillilitres(activity.estimatedSweatLossMl!)),
    row(`Impacto em ${activity.energyLabel ?? "energia"}`, energyImpact === null ? null : formatSigned(energyImpact), providerLabel),
  ]);
  if (energyRows.length > 0) groups.push({ id: "energy", title: "Energia", rows: energyRows });

  const swimRows = rows([
    row("Braçadas", positive(activity.totalStrokes) === null ? null : String(Math.round(activity.totalStrokes!))),
    row("Frequência média de braçadas", positive(activity.averageStrokeRate) === null ? null : `${Math.round(activity.averageStrokeRate!)} spm`),
    row("Frequência máxima de braçadas", positive(activity.maxStrokeRate) === null ? null : `${Math.round(activity.maxStrokeRate!)} spm`),
    row("Distância por braçada", positive(activity.averageDistancePerStroke) === null ? null : `${(Math.round(activity.averageDistancePerStroke! * 100) / 100).toLocaleString("pt-BR")} m`),
    row("SWOLF médio", positive(activity.averageSwolf) === null ? null : String(Math.round(activity.averageSwolf!))),
  ]);
  if (swimRows.length > 0) groups.push({ id: "swim", title: rules.cadenceOrStrokeRate === "stroke-rate" ? "Natação" : "Braçadas", rows: swimRows });

  const temperatureRows = rows([
    row("Mínima", num(activity.minTemperature) === null ? null : formatCelsius(activity.minTemperature!)),
    row("Média", num(activity.averageTemperature) === null ? null : formatCelsius(activity.averageTemperature!)),
    row("Máxima", num(activity.maxTemperature) === null ? null : formatCelsius(activity.maxTemperature!)),
  ]);
  if (temperatureRows.length > 0) groups.push({ id: "temperature", title: "Temperatura", rows: temperatureRows });

  const effectRows = rows([
    row("Carga de treino", positive(activity.trainingLoad) === null ? null : String(Math.round(activity.trainingLoad!))),
    row("Efeito aeróbico", num(activity.aerobicEffect) === null ? null : formatEffect(activity.aerobicEffect!, activity.aerobicEffectLabel)),
    row("Efeito anaeróbico", num(activity.anaerobicEffect) === null ? null : formatEffect(activity.anaerobicEffect!, activity.anaerobicEffectLabel)),
  ]);
  if (effectRows.length > 0) groups.push({ id: "training-effect", title: "Carga e efeito de treino", rows: effectRows, sourceNote: `Escala de ${providerLabel}` });

  return groups;
}

// ---------------------------------------------------------------------------
// Laps
// ---------------------------------------------------------------------------

type LapLike = {
  number: number;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageSpeed: number | null;
  averagePace: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageCadence: number | null;
  averageStrokeRate: number | null;
  averagePower: number | null;
  calories: number | null;
  averageTemperature: number | null;
};

function fromNormalizedLap(lap: NormalizedLap): LapLike {
  return {
    number: lap.lapNumber, durationSeconds: lap.durationSeconds, distanceMeters: lap.distanceMeters, averageSpeed: lap.averageSpeed,
    averagePace: lap.averagePace, averageHeartRate: lap.averageHeartRate, maxHeartRate: lap.maxHeartRate, averageCadence: lap.averageCadence,
    averageStrokeRate: lap.averageStrokeRate, averagePower: lap.averagePower, calories: lap.calories, averageTemperature: lap.averageTemperature,
  };
}

function fromVisualLap(lap: ActivityLap): LapLike {
  return {
    number: lap.index, durationSeconds: lap.durationSeconds, distanceMeters: lap.distanceMeters, averageSpeed: lap.averageSpeed,
    averagePace: null, averageHeartRate: lap.averageHeartRate, maxHeartRate: lap.maxHeartRate, averageCadence: lap.averageCadence,
    averageStrokeRate: null, averagePower: lap.averagePower, calories: null, averageTemperature: null,
  };
}

/** Provider pace, else from speed, else from the lap's own time ÷ distance (never from zero). */
function lapPace(lap: LapLike, pace: MetricDisplayRules["pace"]): number | null {
  const fromProvider = positive(lap.averagePace) ?? paceFromSpeed(lap.averageSpeed, pace);
  if (fromProvider !== null) return fromProvider;
  const duration = positive(lap.durationSeconds);
  const distance = positive(lap.distanceMeters);
  return duration !== null && distance !== null ? paceFromSpeed(distance / duration, pace) : null;
}

function buildLaps(laps: LapLike[], rules: MetricDisplayRules, sourceNote: string): LapsModel | null {
  if (laps.length === 0) return null;
  const vocabulary = rules.pace === "pace-per-100m" ? "lap" : "split";
  const cell = (value: number | null, format: (value: number) => string): string => (value === null ? DASH : format(value));

  type Column = LapColumn & { value: (lap: LapLike) => number | null; format: (value: number) => string; summary: "sum" | "weighted" | "max" | "pace" | null };
  const candidates: Column[] = [
    { key: "duration", label: "Tempo", value: (lap) => positive(lap.durationSeconds), format: formatDuration, summary: "sum" },
    { key: "distance", label: "Distância", value: (lap) => positive(lap.distanceMeters), format: formatDistance, summary: "sum" },
    ...(rules.pace
      ? [{ key: "pace", label: rules.pace === "pace-per-100m" ? "Ritmo /100 m" : "Ritmo /km", value: (lap: LapLike) => lapPace(lap, rules.pace), format: (value: number) => formatPaceByRules(value, rules.pace), summary: "pace" as const }]
      : rules.speedFallback
        ? [{ key: "speed", label: "Velocidade", value: (lap: LapLike) => positive(lap.averageSpeed), format: (value: number) => formatSpeed(value * 3.6), summary: "weighted" as const }]
        : []),
    { key: "avgHr", label: "FC média", value: (lap) => positive(lap.averageHeartRate), format: formatHeartRate, summary: "weighted" },
    { key: "maxHr", label: "FC máx.", value: (lap) => positive(lap.maxHeartRate), format: formatHeartRate, summary: "max" },
    ...(rules.cadenceOrStrokeRate === "stroke-rate"
      ? [{ key: "strokeRate", label: "Braçadas/min", value: (lap: LapLike) => positive(lap.averageStrokeRate) ?? positive(lap.averageCadence), format: (value: number) => `${Math.round(value)} spm`, summary: "weighted" as const }]
      : rules.cadenceOrStrokeRate === "cadence"
        ? [{ key: "cadence", label: "Cadência", value: (lap: LapLike) => positive(lap.averageCadence), format: formatCadence, summary: "weighted" as const }]
        : []),
    { key: "power", label: "Potência", value: (lap) => positive(lap.averagePower), format: formatPower, summary: "weighted" },
    { key: "calories", label: "Calorias", value: (lap) => positive(lap.calories), format: formatCalories, summary: "sum" },
    { key: "temperature", label: "Temp.", value: (lap) => num(lap.averageTemperature), format: formatCelsius, summary: "weighted" },
  ];
  // Absence ≠ zero: a column no lap has is not shown at all.
  const columns = candidates.filter((column) => laps.some((lap) => column.value(lap) !== null));
  if (columns.length === 0) return null;

  const rowsOut: LapRow[] = laps.map((lap) => ({
    number: String(lap.number),
    cells: Object.fromEntries(columns.map((column) => [column.key, cell(column.value(lap), column.format)])),
  }));

  const totalDuration = laps.reduce((sum, lap) => sum + (positive(lap.durationSeconds) ?? 0), 0);
  const totalDistance = laps.reduce((sum, lap) => sum + (positive(lap.distanceMeters) ?? 0), 0);
  const summaryCells: Record<string, string> = {};
  for (const column of columns) {
    let value: number | null = null;
    if (column.summary === "sum") {
      value = positive(laps.reduce((sum, lap) => sum + (column.value(lap) ?? 0), 0));
    } else if (column.summary === "max") {
      value = positive(Math.max(...laps.map((lap) => column.value(lap) ?? 0)));
    } else if (column.summary === "weighted") {
      const weighted = laps.reduce((acc, lap) => {
        const metric = column.value(lap);
        const weight = positive(lap.durationSeconds) ?? 1;
        return metric === null ? acc : { sum: acc.sum + metric * weight, weight: acc.weight + weight };
      }, { sum: 0, weight: 0 });
      value = weighted.weight > 0 ? weighted.sum / weighted.weight : null;
    } else if (column.summary === "pace") {
      value = totalDuration > 0 && totalDistance > 0 ? paceFromSpeed(totalDistance / totalDuration, rules.pace) : null;
    }
    summaryCells[column.key] = cell(value, column.format);
  }

  return {
    vocabulary,
    columns: columns.map(({ key, label }) => ({ key, label, align: "right" as const })),
    rows: rowsOut,
    summary: { number: "Total", cells: summaryCells },
    sourceNote,
  };
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

const ZONE_TITLES: Record<NormalizedZoneSet["zoneType"], string> = {
  HEART_RATE: "Zonas de frequência cardíaca",
  POWER: "Zonas de potência",
  PACE: "Zonas de ritmo",
};

function zoneItems(items: Array<{ label: string; seconds: number; valueText?: string }>): ZoneItem[] {
  const total = items.reduce((sum, item) => sum + item.seconds, 0);
  const max = Math.max(0, ...items.map((item) => item.seconds));
  return items.map((item) => ({
    label: item.label,
    seconds: item.seconds,
    ratio: max > 0 ? item.seconds / max : 0,
    shareText: total > 0 ? `${Math.round((item.seconds / total) * 100)}%` : "0%",
    valueText: item.valueText ?? formatDuration(item.seconds),
  }));
}

function buildZones(rich: ResolvedActivityDetailSources | null, visualData: ActivityVisualData, providerLabel: (id: string) => string): ZoneSetModel[] {
  if (rich && rich.zones.length > 0) {
    return rich.zones.map((set) => ({
      id: set.zoneType.toLowerCase().replace("_", "-"),
      title: ZONE_TITLES[set.zoneType],
      approximate: set.source.kind === "derived",
      sourceNote: set.source.kind === "derived"
        ? `Zonas estimadas pela Ryvano a partir da FC${set.configurationRef?.startsWith("max-hr:") ? ` (FC máx. de referência ${set.configurationRef.slice(7)} bpm)` : ""}.`
        : `Zonas nativas · ${providerLabel(set.source.provider)}`,
      items: zoneItems(set.zones.map((zone) => ({ label: zone.label ?? `Zona ${zone.zoneNumber}`, seconds: zone.durationSeconds }))),
    }));
  }
  // Per-activity fallback: the legacy enrichment's zone sections (approximate or native).
  return visualData.barSections
    .filter((section) => section.id.includes("zone"))
    .map((section) => ({
      id: section.id,
      title: section.title,
      approximate: Boolean(section.approximate),
      sourceNote: section.approximate ? (section.disclaimer ?? "Zonas estimadas.") : `Zonas nativas · ${providerLabel(visualData.provider)}`,
      items: zoneItems(section.items.map((item) => ({ label: item.label, seconds: item.seconds ?? 0, valueText: item.valueText }))),
    }));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildActivityDetailModel(input: ActivityDetailModelInput): ActivityDetailModel {
  const { activity, visualData, rich, providerLabel } = input;
  const rules = rulesFor(visualData.sportKey || activity.sportType);
  const ownLabel = providerLabel(activity.provider);

  const lapSource = rich?.sources.laps;
  const laps = rich && rich.laps.length > 0
    ? buildLaps(rich.laps.map(fromNormalizedLap), rules, lapSource ? `Voltas: ${sourceLabel(lapSource, providerLabel)}` : "")
    : buildLaps((visualData.laps ?? []).map(fromVisualLap), rules, `Voltas: ${ownLabel}`);

  const zones = buildZones(rich, visualData, providerLabel);
  const timeline = buildTimeline(rich, rules, providerLabel);
  const route = buildRoute(activity, rich);

  const sources: string[] = [];
  if (rich) {
    if (rich.sources.laps) sources.push(`Voltas: ${sourceLabel(rich.sources.laps, providerLabel)}`);
    if (rich.sources.zones) sources.push(`Zonas: ${sourceLabel(rich.sources.zones, providerLabel)}`);
    if (rich.sources.streams) sources.push(`Séries: ${sourceLabel(rich.sources.streams, providerLabel)}`);
  }

  const editorialTitle = activity.title?.trim() || null;
  return {
    activityId: activity.id,
    header: {
      title: editorialTitle ?? humanizeActivityLabel(activity.name) ?? visualData.sportLabel,
      editorialTitle,
      sportLabel: visualData.sportLabel,
      subSportType: activity.subSportType ? humanizeActivityLabel(activity.subSportType) : null,
      providerId: visualData.provider,
      providerLabel: ownLabel,
      startedAtLabel: visualData.startedAtLabel,
      kpis: buildKpis(visualData),
    },
    route,
    timeline,
    stats: buildStats(activity, visualData, rules, ownLabel),
    laps,
    zones,
    // Legacy enrichment sections other than zones/splits (e.g. "Análise do treino").
    analysis: visualData.metricSections,
    feedback: input.feedback ?? null,
    sources,
  };
}

/** Client-side formatter for a series value (formats are identifiers so the model stays serialisable). */
export function formatSeriesValue(format: SeriesFormat, value: number): string {
  switch (format) {
    case "pace": return formatPace(value);
    case "swimPace": return formatSwimPace(value);
    case "kmh": return formatSpeed(value);
    case "bpm": return formatHeartRate(value);
    case "rpm": return formatCadence(value);
    case "spm": return `${Math.round(value)} spm`;
    case "watts": return formatPower(value);
    case "celsius": return formatCelsius(value);
    case "meters": return formatElevation(value);
  }
}

export type { ActivityMetricRow };
