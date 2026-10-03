/**
 * SAM-45 — contratos canônicos do detalhe rico de atividade e da saúde diária.
 *
 * Tudo o que mapa, voltas, zonas, séries, calorias, braçadas, efeito de
 * treino e saúde diária precisam, independente do provider. Regras:
 *
 * - **Ausência ≠ zero.** Todo campo é opcional ou `null`; nenhum provider é
 *   obrigado a fornecer nada, e a tela omite o que não existe.
 * - **Proveniência por campo.** `sources` diz de onde veio cada valor e se é
 *   nativo do provider ou derivado pela Ryvano (`MetricSource`). Dois
 *   providers nunca são mesclados silenciosamente: a resolução de fonte
 *   (`modules/shared/activities/source-resolution`) escolhe UM por campo e
 *   rotula.
 * - **Dado proprietário é rotulado, não traduzido.** Body Battery, Training
 *   Effect, Nightly Recharge, PAI… entram como métricas com o nome da origem
 *   (`energyScore` + `energyScoreLabel`, `trainingEffect*`), nunca
 *   convertidos para uma escala comum.
 * - Schemas Zod: o DTO remoto de cada provider é validado no módulo do
 *   provider e mapeado para estes tipos; nada daqui conhece um provider.
 */
import { z } from "zod";

import type { ProviderId } from "@/modules/shared/integrations/types";
import { RYVANO_SPORT_TYPES } from "../sport-types";
import type { NormalizedActivity } from "./index";

const providerIdSchema = z.enum(["GARMIN", "STRAVA", "POLAR", "COROS", "SUUNTO", "FITBIT", "AMAZFIT", "FILE"]) satisfies z.ZodType<ProviderId>;

/** De onde um valor veio e se o provider o mediu (`native`) ou a Ryvano o derivou (`derived`). */
export const metricSourceSchema = z.object({
  provider: providerIdSchema,
  kind: z.enum(["native", "derived"]),
});
export type MetricSource = z.infer<typeof metricSourceSchema>;

const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const nullableNonNegative = nonNegative.nullable();

// ---------------------------------------------------------------------------
// Voltas
// ---------------------------------------------------------------------------

export const normalizedLapSchema = z.object({
  /** 1-based. */
  lapNumber: z.number().int().positive(),
  startedAt: z.date().nullable().default(null),
  durationSeconds: nullableNonNegative.default(null),
  movingSeconds: nullableNonNegative.default(null),
  distanceMeters: nullableNonNegative.default(null),
  /** Segundos por km (ou por 100 m nas modalidades aquáticas — a categoria decide). */
  averagePace: nullableNonNegative.default(null),
  /** m/s */
  averageSpeed: nullableNonNegative.default(null),
  averageHeartRate: nullableNonNegative.default(null),
  maxHeartRate: nullableNonNegative.default(null),
  averageCadence: nullableNonNegative.default(null),
  averageStrokeRate: nullableNonNegative.default(null),
  maxStrokeRate: nullableNonNegative.default(null),
  averageDistancePerStroke: nullableNonNegative.default(null),
  averagePower: nullableNonNegative.default(null),
  calories: nullableNonNegative.default(null),
  averageTemperature: finite.nullable().default(null),
});
export type NormalizedLap = z.infer<typeof normalizedLapSchema>;

// ---------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------

export const zoneTypeSchema = z.enum(["HEART_RATE", "POWER", "PACE"]);
export type ZoneType = z.infer<typeof zoneTypeSchema>;

export const normalizedZoneSchema = z.object({
  zoneNumber: z.number().int().positive(),
  label: z.string().nullable().default(null),
  lowerBound: finite.nullable().default(null),
  upperBound: finite.nullable().default(null),
  durationSeconds: nonNegative,
});
export type NormalizedZone = z.infer<typeof normalizedZoneSchema>;

export const normalizedZoneSetSchema = z.object({
  zoneType: zoneTypeSchema,
  source: metricSourceSchema,
  /** Referência à configuração vigente na data (ex.: revisão da ficha técnica), quando derivada. */
  configurationRef: z.string().nullable().default(null),
  zones: z.array(normalizedZoneSchema),
});
export type NormalizedZoneSet = z.infer<typeof normalizedZoneSetSchema>;

// ---------------------------------------------------------------------------
// Séries temporais (esparsas: lacunas ficam lacunas)
// ---------------------------------------------------------------------------

export const NORMALIZED_STREAM_KEYS = [
  "time", "distance", "latlng", "altitude", "heartRate", "cadence", "strokeRate", "power", "speed", "temperature",
] as const;
export const normalizedStreamKeySchema = z.enum(NORMALIZED_STREAM_KEYS);
export type NormalizedStreamKey = z.infer<typeof normalizedStreamKeySchema>;

const streamSampleSchema = z.union([finite, z.tuple([finite, finite]), z.null()]);

export const normalizedStreamSchema = z.object({
  key: normalizedStreamKeySchema,
  /** Alinhada à série `time`; `null` é lacuna, nunca zero. */
  values: z.array(streamSampleSchema),
  source: metricSourceSchema,
});
export type NormalizedStream = z.infer<typeof normalizedStreamSchema>;

// ---------------------------------------------------------------------------
// Estatísticas estendidas
// ---------------------------------------------------------------------------

export const normalizedActivityStatsSchema = z.object({
  timerSeconds: nullableNonNegative.default(null),
  elapsedSeconds: nullableNonNegative.default(null),
  caloriesActive: nullableNonNegative.default(null),
  caloriesResting: nullableNonNegative.default(null),
  estimatedSweatLossMl: nullableNonNegative.default(null),
  totalStrokes: nullableNonNegative.default(null),
  averageStrokeRate: nullableNonNegative.default(null),
  maxStrokeRate: nullableNonNegative.default(null),
  averageDistancePerStroke: nullableNonNegative.default(null),
  averageSwolf: nullableNonNegative.default(null),
  averageTemperature: finite.nullable().default(null),
  minTemperature: finite.nullable().default(null),
  maxTemperature: finite.nullable().default(null),
  /** Carga/efeito proprietários: valor + rótulo do provider, nunca convertidos. */
  trainingLoad: nullableNonNegative.default(null),
  aerobicEffect: nullableNonNegative.default(null),
  aerobicEffectLabel: z.string().nullable().default(null),
  anaerobicEffect: nullableNonNegative.default(null),
  anaerobicEffectLabel: z.string().nullable().default(null),
  /** Impacto na energia proprietária do provider (ex.: Body Battery), rotulado por `energyLabel`. */
  energyImpact: finite.nullable().default(null),
  energyLabel: z.string().nullable().default(null),
  routePolyline: z.string().nullable().default(null),
  startLatitude: finite.nullable().default(null),
  startLongitude: finite.nullable().default(null),
  endLatitude: finite.nullable().default(null),
  endLongitude: finite.nullable().default(null),
  subSportType: z.string().nullable().default(null),
});
export type NormalizedActivityStats = z.infer<typeof normalizedActivityStatsSchema>;

export const ACTIVITY_DETAIL_FIELDS = ["laps", "zones", "streams", "stats"] as const;
export type ActivityDetailField = (typeof ACTIVITY_DETAIL_FIELDS)[number];

/**
 * O detalhe rico de UMA atividade, como um provider o entrega
 * (`ActivityDetailProvider.getActivityDetail`): tudo opcional, com proveniência.
 */
export const normalizedActivityDetailSchema = z.object({
  provider: providerIdSchema,
  externalId: z.string().min(1),
  laps: z.array(normalizedLapSchema).default([]),
  zones: z.array(normalizedZoneSetSchema).default([]),
  streams: z.array(normalizedStreamSchema).default([]),
  stats: normalizedActivityStatsSchema.prefault({}),
  /** Quem forneceu cada bloco; blocos ausentes não aparecem aqui. */
  sources: z.partialRecord(z.enum(ACTIVITY_DETAIL_FIELDS), metricSourceSchema).default({}),
});
export type NormalizedActivityDetail = z.infer<typeof normalizedActivityDetailSchema>;

/** A atividade canônica e o seu detalhe, como a tela os consome depois da resolução de fonte. */
export type ResolvedActivityDetail = {
  activity: NormalizedActivity;
  detail: Omit<NormalizedActivityDetail, "provider" | "externalId">;
  /** Provider cuja linha é a exibida; os outros candidatos são duplicatas da mesma sessão. */
  primaryProvider: ProviderId;
};

// ---------------------------------------------------------------------------
// Saúde diária (separada da atividade — doc §44)
// ---------------------------------------------------------------------------

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data local YYYY-MM-DD");

export const normalizedDailyHealthSchema = z.object({
  provider: providerIdSchema,
  /** Dia local do atleta. */
  date: localDate,
  timeZone: z.string().min(1),
  fetchedAt: z.date(),
  restingHeartRate: nullableNonNegative.default(null),
  restingHeartRate7dAvg: nullableNonNegative.default(null),
  /** Energia proprietária (Body Battery, Nightly Recharge…), rotulada por `energyLabel`. */
  energyScore: nullableNonNegative.default(null),
  energyHighest: nullableNonNegative.default(null),
  energyLowest: nullableNonNegative.default(null),
  energyLabel: z.string().nullable().default(null),
  sleepScore: nullableNonNegative.default(null),
  sleepDurationSeconds: nullableNonNegative.default(null),
  sleepStart: z.date().nullable().default(null),
  sleepEnd: z.date().nullable().default(null),
  deepSleepSeconds: nullableNonNegative.default(null),
  lightSleepSeconds: nullableNonNegative.default(null),
  remSleepSeconds: nullableNonNegative.default(null),
  awakeSeconds: nullableNonNegative.default(null),
  hrvLastNight: nullableNonNegative.default(null),
  hrv7dAvg: nullableNonNegative.default(null),
  hrvStatus: z.string().nullable().default(null),
  readinessScore: nullableNonNegative.default(null),
  readinessLevel: z.string().nullable().default(null),
  recoveryTimeMinutes: nullableNonNegative.default(null),
  steps: nullableNonNegative.default(null),
  activeKilocalories: nullableNonNegative.default(null),
  totalKilocalories: nullableNonNegative.default(null),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedDailyHealth = z.infer<typeof normalizedDailyHealthSchema>;

/** Campos de saúde que a resolução de fonte escolhe um a um. */
export const DAILY_HEALTH_FIELDS = [
  "restingHeartRate", "restingHeartRate7dAvg",
  "energyScore", "energyHighest", "energyLowest", "energyLabel",
  "sleepScore", "sleepDurationSeconds", "sleepStart", "sleepEnd",
  "deepSleepSeconds", "lightSleepSeconds", "remSleepSeconds", "awakeSeconds",
  "hrvLastNight", "hrv7dAvg", "hrvStatus",
  "readinessScore", "readinessLevel", "recoveryTimeMinutes",
  "steps", "activeKilocalories", "totalKilocalories",
] as const satisfies readonly (keyof NormalizedDailyHealth)[];
export type DailyHealthField = (typeof DAILY_HEALTH_FIELDS)[number];

/** Uma sessão como a resolução de fonte a vê para detectar a mesma atividade vinda de duas conexões. */
export const sessionFingerprintSchema = z.object({
  id: z.string().min(1),
  provider: providerIdSchema,
  sportType: z.enum(RYVANO_SPORT_TYPES as unknown as [string, ...string[]]),
  startedAt: z.date(),
  durationSeconds: nullableNonNegative.default(null),
  distanceMeters: nullableNonNegative.default(null),
});
export type SessionFingerprint = z.infer<typeof sessionFingerprintSchema>;
