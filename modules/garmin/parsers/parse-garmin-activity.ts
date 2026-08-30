/**
 * Parser de atividade do Garmin.
 *
 * Este arquivo é a nova casa do antigo `normalizeGarminActivity`
 * (`server/services/activity-normalizer.ts`), agora dentro do módulo Garmin.
 * Ele expõe duas superfícies complementares construídas a partir de **uma única
 * extração** dos campos crus do payload (`extractGarminActivityFields`), o que
 * garante que as duas nunca divirjam:
 *
 * 1. `parseGarminActivity(payload): NormalizedActivity` — a saída **canônica**,
 *    provider-agnostic, com `source = "GARMIN"`, `sportType` mapeado para
 *    `RyvanoSportType` via `parseGarminSportType`, e `providerSportType`
 *    preservando o valor bruto do Garmin.
 *
 * 2. `normalizeGarminActivity(payload)` — a **ponte de persistência**: produz o
 *    shape gravado no model `Activity`. A partir da tarefa 3.4 essa gravação é
 *    **canônica**: `sportType` recebe o `RyvanoSportType` (via
 *    `parseGarminSportType`) e `providerSportType` preserva a string bruta
 *    original do Garmin (o valor que antes era gravado em `sportType`).
 *
 * ### Persistência canônica (tarefa 3.4)
 *
 * Ambas as superfícies derivam de `extractGarminActivityFields`, portanto
 * `normalizeGarminActivity` e `parseGarminActivity` concordam sobre o par
 * `sportType`/`providerSportType`. O serviço de sync (`garmin-service.ts`)
 * espalha o objeto de `normalizeGarminActivity` tanto no `create` quanto no
 * `update` do `activity.upsert`, de modo que os dois campos fluem para o banco
 * sem alteração adicional no serviço.
 *
 * Fases relacionadas já concluídas:
 * - Tarefa 3.1: adicionou a coluna `providerSportType String?` a `Activity`.
 * - Tarefa 3.3: migração de dados que converteu `Activity.sportType` (string
 *   Garmin) para `RyvanoSportType` canônico e preencheu `providerSportType` com
 *   o valor original.
 *
 * _Requisitos: 5.1, 5.2, 7.3, 7.4, 7.5_
 */

import { WearableProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { NormalizedActivity } from "@/modules/shared/activities/contracts";
import { parseGarminSportType } from "@/modules/garmin/parsers/parse-garmin-sport-type";

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nestedStringOrNull(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return stringOrNull((value as Record<string, unknown>).typeKey) ?? stringOrNull((value as Record<string, unknown>).displayName);
}

function dateOrNull(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getExternalId(payload: Record<string, unknown>) {
  const candidates = [payload.activityId, payload.id, payload.externalId, payload.uuid];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);

  if (!value) {
    throw new Error("GARMIN_ACTIVITY_ID_MISSING");
  }

  return String(value);
}

/**
 * Extração única dos campos crus do payload Garmin.
 *
 * Todas as superfícies (`normalizeGarminActivity` e `parseGarminActivity`)
 * derivam deste resultado, evitando divergência entre a saída de persistência e
 * a saída canônica. `providerSportType` é exatamente a string que hoje é gravada
 * em `Activity.sportType`.
 */
function extractGarminActivityFields(payload: Record<string, unknown>) {
  const startedAt =
    dateOrNull(payload.startTimeLocal) ??
    dateOrNull(payload.startTimeGmt) ??
    dateOrNull(payload.startTime) ??
    new Date();

  const durationSeconds =
    numberOrNull(payload.durationSeconds) ??
    numberOrNull(payload.duration) ??
    numberOrNull(payload.elapsedDuration) ??
    null;

  const endedAt = durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

  const providerSportType =
    stringOrNull(payload.sportType) ??
    nestedStringOrNull(payload, "activityType") ??
    nestedStringOrNull(payload, "eventType") ??
    stringOrNull(payload.typeKey) ??
    "Atividade";

  return {
    externalId: getExternalId(payload),
    providerSportType,
    name:
      stringOrNull(payload.activityName) ??
      stringOrNull(payload.name) ??
      stringOrNull(payload.summary) ??
      null,
    startedAt,
    endedAt,
    durationSeconds,
    movingSeconds: numberOrNull(payload.movingDuration) ?? numberOrNull(payload.movingDurationSeconds),
    distanceMeters: numberOrNull(payload.distance) ?? numberOrNull(payload.distanceMeters),
    calories: numberOrNull(payload.calories),
    averageHeartRate: numberOrNull(payload.averageHR) ?? numberOrNull(payload.averageHeartRate),
    maxHeartRate: numberOrNull(payload.maxHR) ?? numberOrNull(payload.maxHeartRate),
    averagePace: numberOrNull(payload.averagePace),
    averageSpeed: numberOrNull(payload.averageSpeed),
    maxSpeed: numberOrNull(payload.maxSpeed),
    elevationGain: numberOrNull(payload.elevationGain),
    averageCadence: numberOrNull(payload.averageCadence),
    averagePower: numberOrNull(payload.averagePower),
    maxPower: numberOrNull(payload.maxPower),
    timezone: stringOrNull(payload.timeZoneUnitDTO) ?? stringOrNull(payload.timezone),
  };
}

/**
 * Produz o shape de persistência do model `Activity`.
 *
 * A partir da tarefa 3.4 a persistência é **canônica**: `sportType` recebe o
 * valor `RyvanoSportType` derivado de `parseGarminSportType`, enquanto
 * `providerSportType` preserva a string bruta original do Garmin (o valor que
 * antes era gravado em `sportType`). `metrics`/`rawPayload` continuam recebendo
 * o payload inteiro. Como o serviço de sync (`garmin-service.ts`) espalha este
 * objeto tanto no `create` quanto no `update` do `activity.upsert`, ambos os
 * campos fluem para o banco sem alteração adicional no serviço.
 *
 * _Requisitos: 7.3, 7.5, 5.2_
 */
export function normalizeGarminActivity(payload: Record<string, unknown>) {
  const fields = extractGarminActivityFields(payload);

  return {
    externalId: fields.externalId,
    provider: WearableProvider.GARMIN,
    sportType: parseGarminSportType(fields.providerSportType),
    providerSportType: fields.providerSportType,
    name: fields.name,
    startedAt: fields.startedAt,
    endedAt: fields.endedAt,
    durationSeconds: fields.durationSeconds,
    movingSeconds: fields.movingSeconds,
    distanceMeters: fields.distanceMeters,
    calories: fields.calories,
    averageHeartRate: fields.averageHeartRate,
    maxHeartRate: fields.maxHeartRate,
    averagePace: fields.averagePace,
    averageSpeed: fields.averageSpeed,
    maxSpeed: fields.maxSpeed,
    elevationGain: fields.elevationGain,
    averageCadence: fields.averageCadence,
    averagePower: fields.averagePower,
    maxPower: fields.maxPower,
    timezone: fields.timezone,
    metrics: payload as Prisma.JsonObject,
    rawPayload: payload as Prisma.JsonObject,
  };
}

/**
 * Produz a `NormalizedActivity` canônica de uma atividade Garmin.
 *
 * `sportType` é o valor canônico (`RyvanoSportType`) derivado de
 * `parseGarminSportType`, enquanto `providerSportType` preserva a string bruta
 * do Garmin. Campos de métrica ausentes ficam `undefined` (em vez de `null`),
 * conforme o contrato compartilhado. O payload cru é preservado em `raw` para
 * detalhe/enriquecimento.
 *
 * _Requisitos: 7.1, 7.3, 7.4, 7.5_
 */
export function parseGarminActivity(payload: Record<string, unknown>): NormalizedActivity {
  const fields = extractGarminActivityFields(payload);

  return {
    source: "GARMIN",
    externalId: fields.externalId,
    sportType: parseGarminSportType(fields.providerSportType),
    providerSportType: fields.providerSportType,
    startedAt: fields.startedAt,
    durationSeconds: fields.durationSeconds ?? undefined,
    movingSeconds: fields.movingSeconds ?? undefined,
    distanceMeters: fields.distanceMeters ?? undefined,
    averageHeartRate: fields.averageHeartRate ?? undefined,
    maxHeartRate: fields.maxHeartRate ?? undefined,
    averageSpeed: fields.averageSpeed ?? undefined,
    maxSpeed: fields.maxSpeed ?? undefined,
    elevationGain: fields.elevationGain ?? undefined,
    averageCadence: fields.averageCadence ?? undefined,
    averagePower: fields.averagePower ?? undefined,
    maxPower: fields.maxPower ?? undefined,
    raw: payload,
  };
}
