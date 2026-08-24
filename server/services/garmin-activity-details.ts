import type { Activity } from "@prisma/client";
import { SecretType } from "@prisma/client";

import {
  formatCalories,
  formatCadence,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/crypto/secret-vault";
import { garminProvider } from "@/server/providers/wearables/garmin";

export type ActivityHeroStat = {
  label: string;
  value: string;
  tone: string;
};

export type ActivityMetricRow = {
  label: string;
  value: string;
};

export type ActivityBarSection = {
  title: string;
  description: string;
  items: Array<{
    label: string;
    valueText: string;
    ratio: number;
    color: string;
  }>;
};

export type ActivityMetricSection = {
  title: string;
  description: string;
  metrics: ActivityMetricRow[];
};

export type GarminActivityVisualData = {
  sportLabel: string;
  sportKey: string;
  provider: string;
  startedAtLabel: string;
  heroStats: ActivityHeroStat[];
  overviewMetrics: ActivityMetricRow[];
  barSections: ActivityBarSection[];
  metricSections: ActivityMetricSection[];
  technicalData: Record<string, unknown>;
};

const BAR_PALETTES = {
  heartRate: [
    "linear-gradient(90deg,#38bdf8,#67e8f9)",
    "linear-gradient(90deg,#34d399,#6ee7b7)",
    "linear-gradient(90deg,#f59e0b,#fbbf24)",
    "linear-gradient(90deg,#fb7185,#f97316)",
    "linear-gradient(90deg,#a78bfa,#f472b6)",
  ],
  power: [
    "linear-gradient(90deg,#60a5fa,#22d3ee)",
    "linear-gradient(90deg,#22c55e,#4ade80)",
    "linear-gradient(90deg,#facc15,#f59e0b)",
    "linear-gradient(90deg,#f97316,#ef4444)",
    "linear-gradient(90deg,#c084fc,#8b5cf6)",
  ],
  splits: [
    "linear-gradient(90deg,#22d3ee,#38bdf8)",
    "linear-gradient(90deg,#a78bfa,#c084fc)",
    "linear-gradient(90deg,#4ade80,#22c55e)",
    "linear-gradient(90deg,#f59e0b,#fb7185)",
  ],
} as const;

export async function getGarminActivityVisualData(activity: Activity): Promise<GarminActivityVisualData | null> {
  if (activity.provider !== "GARMIN") {
    return null;
  }

  const accountApiKey = await getGarminAccountApiKey(activity.wearableConnectionId);

  if (!accountApiKey) {
    return null;
  }

  const [liveSummary, details, splits, typedSplits, splitSummaries, weather, hrZones, powerZones, exerciseSets] = await Promise.all([
    loadOptional(() => garminProvider.getActivitySummary({ accountApiKey, activityId: activity.externalId }), null),
    loadOptional(() => garminProvider.getActivityDetails({ accountApiKey, activityId: activity.externalId, maxChart: 200, maxPoly: 1500 }), null),
    loadOptional(() => garminProvider.getActivitySplits({ accountApiKey, activityId: activity.externalId }), []),
    loadOptional(() => garminProvider.getActivityTypedSplits({ accountApiKey, activityId: activity.externalId }), []),
    loadOptional(() => garminProvider.getActivitySplitSummaries({ accountApiKey, activityId: activity.externalId }), []),
    loadOptional(() => garminProvider.getActivityWeather({ accountApiKey, activityId: activity.externalId }), null),
    loadOptional(() => garminProvider.getActivityHeartRateZones({ accountApiKey, activityId: activity.externalId }), null),
    loadOptional(() => garminProvider.getActivityPowerZones({ accountApiKey, activityId: activity.externalId }), null),
    loadOptional(() => garminProvider.getActivityExerciseSets({ accountApiKey, activityId: activity.externalId }), []),
  ]);

  const storedSummary = asRecord(activity.metrics);
  const summary = asRecord(liveSummary) ?? storedSummary ?? {};
  const sportKey = resolveGarminSportKey(summary, activity.sportType);
  const sportLabel = humanizeSportKey(sportKey);
  const overviewMetrics = buildOverviewMetrics(activity, summary, sportKey);
  const heroStats = buildHeroStats(activity, summary, sportKey);
  const metricSections = buildMetricSections(summary, weather, exerciseSets);
  const barSections = [
    buildZoneSection("Zonas de frequência cardíaca", "Tempo real em cada zona cardíaca retornado pela Garmin.", hrZones, summary, "hrTimeInZone_", BAR_PALETTES.heartRate),
    buildZoneSection("Zonas de potência", "Distribuição real do treino por zonas de potência quando o dispositivo envia este bloco.", powerZones, summary, "powerTimeInZone_", BAR_PALETTES.power),
    buildSplitsSection(sportKey, typedSplits, splits, splitSummaries),
  ].filter(Boolean) as ActivityBarSection[];

  return {
    sportLabel,
    sportKey,
    provider: activity.provider,
    startedAtLabel: formatDateTime(activity.startedAt),
    heroStats,
    overviewMetrics,
    barSections,
    metricSections,
    technicalData: {
      summary,
      details,
      splits,
      typedSplits,
      splitSummaries,
      weather,
      hrZones,
      powerZones,
      exerciseSets,
    },
  };
}

async function getGarminAccountApiKey(wearableConnectionId: string) {
  const secret = await prisma.wearableSecret.findUnique({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId,
        secretType: SecretType.GARMIN_API_KEY,
      },
    },
  });

  return secret ? decryptSecret(secret) : null;
}

async function loadOptional<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function buildHeroStats(activity: Activity, summary: Record<string, unknown>, sportKey: string) {
  const stats: ActivityHeroStat[] = [
    { label: "Duração", value: formatDuration(activity.durationSeconds), tone: "text-cyan-200" },
    { label: "Distância", value: formatDistance(activity.distanceMeters), tone: "text-fuchsia-200" },
  ];

  const thirdValue =
    sportKey.includes("swim")
      ? formatSwimPace(activity.averagePace)
      : sportKey.includes("run")
        ? formatPace(activity.averagePace)
        : activity.averageSpeed
          ? formatSpeed(activity.averageSpeed * 3.6)
          : formatCalories(activity.calories);

  stats.push({
    label: sportKey.includes("swim") ? "Ritmo" : sportKey.includes("run") ? "Pace" : activity.averageSpeed ? "Velocidade" : "Calorias",
    value: thirdValue,
    tone: "text-emerald-200",
  });

  return stats.filter((item) => item.value !== "—");
}

function buildOverviewMetrics(activity: Activity, summary: Record<string, unknown>, sportKey: string) {
  const rows: ActivityMetricRow[] = [];
  const push = (label: string, value: string) => {
    if (value !== "—") {
      rows.push({ label, value });
    }
  };

  push("Início", formatDateTime(activity.startedAt));
  push("Duração", formatDuration(activity.durationSeconds));
  push("Distância", formatDistance(activity.distanceMeters));
  push("Calorias", formatCalories(activity.calories));
  push("FC média", formatHeartRate(activity.averageHeartRate));
  push("FC máxima", formatHeartRate(activity.maxHeartRate));
  push("Elevação", formatElevation(activity.elevationGain));

  if (sportKey.includes("swim")) {
    push("Ritmo médio", formatSwimPace(activity.averagePace));
    push("Cadência de nado", formatCadence(getNumber(summary, ["averageSwimCadenceInStrokesPerMinute"]) ?? activity.averageCadence));
    push("SWOLF", formatNumberMetric(getNumber(summary, ["averageSwolf"]), ""));
    push("Braçadas", formatNumberMetric(getNumber(summary, ["strokes"]), ""));
    push("Tamanho da piscina", formatPoolLength(summary));
    push("Voltas", formatNumberMetric(getNumber(summary, ["lapCount", "activeLengths"]), ""));
    return rows;
  }

  if (sportKey.includes("run")) {
    push("Pace médio", formatPace(activity.averagePace));
    push("Cadência", formatCadence(getNumber(summary, ["averageRunningCadenceInStepsPerMinute"]) ?? activity.averageCadence));
  } else {
    push("Velocidade média", formatSpeed(activity.averageSpeed ? activity.averageSpeed * 3.6 : null));
    push("Velocidade máx.", formatSpeed(activity.maxSpeed ? activity.maxSpeed * 3.6 : null));
    push("Cadência", formatCadence(activity.averageCadence));
    push("Potência média", formatPower(getNumber(summary, ["avgPower"]) ?? activity.averagePower));
    push("Potência normalizada", formatPower(getNumber(summary, ["normPower"])));
  }

  push("Carga", formatNumberMetric(getNumber(summary, ["activityTrainingLoad"]), ""));
  push("Efeito aeróbico", formatNumberMetric(getNumber(summary, ["aerobicTrainingEffect"]), ""));
  push("Efeito anaeróbico", formatNumberMetric(getNumber(summary, ["anaerobicTrainingEffect"]), ""));

  return rows;
}

function buildMetricSections(
  summary: Record<string, unknown>,
  weather: Record<string, unknown> | null,
  exerciseSets: unknown[],
) {
  const sections: ActivityMetricSection[] = [];
  const trainingMetrics = [
    metricRow("Rótulo de treino", getString(summary, ["trainingEffectLabel"])),
    metricRow("Mensagem aeróbica", humanizeText(getString(summary, ["aerobicTrainingEffectMessage"]))),
    metricRow("Mensagem anaeróbica", humanizeText(getString(summary, ["anaerobicTrainingEffectMessage"]))),
    metricRow("Minutos moderados", formatNumberMetric(getNumber(summary, ["moderateIntensityMinutes"]), " min")),
    metricRow("Minutos vigorosos", formatNumberMetric(getNumber(summary, ["vigorousIntensityMinutes"]), " min")),
  ].filter(Boolean) as ActivityMetricRow[];

  if (trainingMetrics.length) {
    sections.push({
      title: "Leituras de treino",
      description: "Indicadores adicionais retornados pela Garmin para esforço e intensidade.",
      metrics: trainingMetrics,
    });
  }

  const weatherMetrics = weather
    ? [
        metricRow("Temperatura", formatTemperature(getNumber(weather, ["temperature", "maxTemperature", "averageTemperature"]))),
        metricRow("Sensação térmica", formatTemperature(getNumber(weather, ["feelsLikeTemperature"]))),
        metricRow("Vento", formatWind(getNumber(weather, ["windSpeed", "maxWindSpeed"]))),
        metricRow("Umidade", formatPercent(getNumber(weather, ["humidity", "averageHumidity"]))),
      ].filter(Boolean) as ActivityMetricRow[]
    : [];

  if (weatherMetrics.length) {
    sections.push({
      title: "Clima da atividade",
      description: "Leituras meteorológicas reais da sessão quando Garmin disponibiliza este bloco.",
      metrics: weatherMetrics,
    });
  }

  const strengthMetrics = exerciseSets.length
    ? [
        metricRow("Séries detectadas", String(exerciseSets.length)),
        metricRow("Total de séries", formatNumberMetric(getNumber(summary, ["totalSets"]), "")),
        metricRow("Séries ativas", formatNumberMetric(getNumber(summary, ["activeSets"]), "")),
        metricRow("Repetições", formatNumberMetric(getNumber(summary, ["totalReps"]), "")),
        metricRow("Volume", formatNumberMetric(getNumber(summary, ["totalVolume"]), "")),
      ].filter(Boolean) as ActivityMetricRow[]
    : [];

  if (strengthMetrics.length) {
    sections.push({
      title: "Bloco de musculação",
      description: "Resumo real de séries e repetições enviado pela Garmin para sessões de força.",
      metrics: strengthMetrics,
    });
  }

  return sections;
}

function buildZoneSection(
  title: string,
  description: string,
  payload: unknown,
  summary: Record<string, unknown>,
  fallbackPrefix: string,
  palette: readonly string[],
) {
  const fromPayload = normalizeZoneItems(payload, palette);
  const items = fromPayload.length ? fromPayload : normalizeZoneItemsFromSummary(summary, fallbackPrefix, palette);

  if (!items.length) {
    return null;
  }

  return {
    title,
    description,
    items,
  } satisfies ActivityBarSection;
}

function buildSplitsSection(
  sportKey: string,
  typedSplits: unknown[],
  splits: unknown[],
  splitSummaries: unknown[],
) {
  const source = typedSplits.length ? typedSplits : splits.length ? splits : splitSummaries;
  const items = normalizeSplitItems(source, sportKey);

  if (!items.length) {
    return null;
  }

  return {
    title: typedSplits.length ? "Splits por modalidade" : splits.length ? "Splits da atividade" : "Resumo de splits",
    description: typedSplits.length
      ? "Bloco real de splits específicos do esporte retornado pela Garmin."
      : splits.length
        ? "Voltas e splits reais da atividade retornados pela Garmin."
        : "Resumo real dos splits quando Garmin devolve versão resumida.",
    items,
  } satisfies ActivityBarSection;
}

function normalizeZoneItems(payload: unknown, palette: readonly string[]) {
  const rows = toRecordArray(payload);

  if (!rows.length) {
    return [];
  }

  const normalized = rows.map((row, index) => ({
    label: getZoneLabel(row, index),
    seconds: normalizeZoneSeconds(row),
    color: palette[index % palette.length] ?? palette[0] ?? "linear-gradient(90deg,#38bdf8,#67e8f9)",
  })).filter((row) => row.seconds > 0);

  const max = Math.max(...normalized.map((row) => row.seconds), 1);

  return normalized.map((row) => ({
    label: row.label,
    valueText: formatDuration(row.seconds),
    ratio: Math.max(row.seconds / max, 0.08),
    color: row.color,
  }));
}

function normalizeZoneItemsFromSummary(summary: Record<string, unknown>, prefix: string, palette: readonly string[]) {
  const values = Array.from({ length: 5 }, (_, index) => ({
    label: `Zona ${index + 1}`,
    seconds: getNumber(summary, [`${prefix}${index + 1}`]) ?? 0,
    color: palette[index % palette.length] ?? palette[0] ?? "linear-gradient(90deg,#38bdf8,#67e8f9)",
  })).filter((item) => item.seconds > 0);

  const max = Math.max(...values.map((item) => item.seconds), 1);

  return values.map((item) => ({
    label: item.label,
    valueText: formatDuration(item.seconds),
    ratio: Math.max(item.seconds / max, 0.08),
    color: item.color,
  }));
}

function normalizeSplitItems(source: unknown[], sportKey: string) {
  const rows = toRecordArray(source).slice(0, 12);

  if (!rows.length) {
    return [];
  }

  const values = rows.map((row, index) => {
    const duration = getNumber(row, ["elapsedDuration", "duration", "movingDuration", "totalTimeInSeconds", "timeInSeconds"]);
    const distance = getNumber(row, ["distance", "distanceInMeters", "totalDistanceInMeters", "lengthDistance"]);
    const primary = duration ?? distance ?? firstNumericValue(row);

    return {
      label: getSplitLabel(row, index, sportKey),
      primary: primary ?? 0,
      valueText: buildSplitValueText(row, duration, distance, sportKey),
      color: BAR_PALETTES.splits[index % BAR_PALETTES.splits.length] ?? BAR_PALETTES.splits[0],
    };
  }).filter((item) => item.primary > 0 && item.valueText !== "—");

  const max = Math.max(...values.map((item) => item.primary), 1);

  return values.map((item) => ({
    label: item.label,
    valueText: item.valueText,
    ratio: Math.max(item.primary / max, 0.08),
    color: item.color,
  }));
}

function buildSplitValueText(row: Record<string, unknown>, duration: number | null, distance: number | null, sportKey: string) {
  const parts: string[] = [];

  if (distance !== null) {
    parts.push(formatDistance(distance));
  }

  if (duration !== null) {
    parts.push(formatDuration(duration));
  }

  const avgHeartRate = getNumber(row, ["averageHR", "avgHr", "averageHeartRate"]);
  const avgPower = getNumber(row, ["averagePower", "avgPower"]);
  const avgCadence = getNumber(row, ["averageCadence", "averageRunningCadenceInStepsPerMinute", "averageSwimCadenceInStrokesPerMinute"]);
  const avgSpeed = getNumber(row, ["averageSpeed", "avgSpeed"]);
  const avgPace = getNumber(row, ["averagePace", "pace"]);

  if (sportKey.includes("swim")) {
    const swimPace = formatSwimPace(avgPace);
    if (swimPace !== "—") {
      parts.push(swimPace);
    }
  } else {
    const pace = formatPace(avgPace);
    const speed = formatSpeed(avgSpeed ? avgSpeed * 3.6 : null);

    if (pace !== "—") {
      parts.push(pace);
    } else if (speed !== "—") {
      parts.push(speed);
    }
  }

  const hr = formatHeartRate(avgHeartRate);
  if (hr !== "—") {
    parts.push(hr);
  }

  const power = formatPower(avgPower);
  if (power !== "—") {
    parts.push(power);
  }

  const cadence = formatCadence(avgCadence);
  if (cadence !== "—") {
    parts.push(cadence);
  }

  return parts.join(" · ") || "—";
}

function resolveGarminSportKey(summary: Record<string, unknown>, fallbackSportType: string) {
  const activityType = asRecord(summary.activityType);
  const raw =
    stringOrNull(activityType?.typeKey) ??
    stringOrNull(activityType?.displayName) ??
    stringOrNull(summary.sportType) ??
    stringOrNull(summary.typeKey) ??
    fallbackSportType;

  return raw.trim().toLowerCase();
}

function humanizeSportKey(value: string) {
  if (!value) {
    return "Atividade";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function metricRow(label: string, value: string | null) {
  return value && value !== "—" ? { label, value } : null;
}

function formatPoolLength(summary: Record<string, unknown>) {
  const poolLength = getNumber(summary, ["poolLength"]);
  const unit = asRecord(summary.unitOfPoolLength);
  const unitKey = stringOrNull(unit?.unitKey);

  if (poolLength === null) {
    return "—";
  }

  if (unitKey === "meter") {
    return `${poolLength / 100} m`;
  }

  return `${poolLength}`;
}

function formatNumberMetric(value: number | null, suffix: string) {
  return value === null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

function formatTemperature(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} °C`;
}

function formatWind(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)} km/h`;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function humanizeText(value: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase() : null;
}

function getZoneLabel(row: Record<string, unknown>, index: number) {
  const label = getString(row, ["label", "name", "zoneName"]);
  const zone = getNumber(row, ["zoneNumber", "zone", "zoneOrder"]);

  if (label) {
    return label;
  }

  if (zone !== null) {
    return `Zona ${Math.round(zone)}`;
  }

  return `Zona ${index + 1}`;
}

function normalizeZoneSeconds(row: Record<string, unknown>) {
  const milliseconds = getNumber(row, ["millisInZone", "milliseconds", "durationInMilliseconds"]);
  if (milliseconds !== null) {
    return milliseconds > 1000 ? milliseconds / 1000 : milliseconds;
  }

  return getNumber(row, ["secsInZone", "seconds", "timeInSeconds", "duration", "value"]) ?? 0;
}

function getSplitLabel(row: Record<string, unknown>, index: number, sportKey: string) {
  const explicitLabel = getString(row, ["label", "name", "splitType", "lapLabel"]);

  if (explicitLabel) {
    return explicitLabel;
  }

  const order = getNumber(row, ["lapIndex", "lapNumber", "splitNumber", "startIndex"]);

  if (order !== null) {
    if (sportKey.includes("swim")) {
      return `Volta ${Math.round(order) + (String(order).includes(".") ? 0 : 1)}`;
    }

    return `Split ${Math.round(order) + (String(order).includes(".") ? 0 : 1)}`;
  }

  return sportKey.includes("swim") ? `Volta ${index + 1}` : `Split ${index + 1}`;
}

function firstNumericValue(row: Record<string, unknown>) {
  for (const value of Object.values(row)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function toRecordArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    }
  }

  return [];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringOrNull(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}
