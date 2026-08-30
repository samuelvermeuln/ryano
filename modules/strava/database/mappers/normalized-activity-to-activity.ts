/**
 * Mapper: `NormalizedActivity` (Strava) → colunas do model Prisma `Activity`.
 *
 * O sync (Task 6.4) faz o upsert idempotente na `Activity` chaveado pelo unique
 * `(provider, externalId, userId)`. Este mapper concentra a tradução do contrato
 * canônico para o shape gravado no banco, espelhando o que o Garmin faz em
 * `normalizeGarminActivity` (que produz diretamente o shape de persistência).
 *
 * Regras de tipo (alinhadas ao `schema.prisma`):
 *   - Colunas `Int?` (`durationSeconds`, `movingSeconds`, `calories`,
 *     `averageHeartRate`, `maxHeartRate`) recebem valores ARREDONDADOS — o Strava
 *     reporta HR média como float (ex.: 142.3 bpm).
 *   - Colunas `Float?` (`distanceMeters`, `averageSpeed`, `maxSpeed`,
 *     `elevationGain`, `averageCadence`, `averagePower`, `maxPower`) recebem o
 *     valor como está.
 *   - `sportType` é o `RyvanoSportType` canônico; `providerSportType` preserva o
 *     valor bruto do Strava (Req 7.5).
 *   - `metrics`/`rawPayload` recebem o payload cru (`raw`) para detalhe/reprocesso.
 *
 * Campos derivados do payload cru do Strava quando disponíveis (não fazem parte
 * do contrato canônico): `name`, `calories`, `timezone`. `endedAt` é derivado de
 * `startedAt + durationSeconds`. Todos toleram ausência (atividades manuais).
 *
 * _Requisitos: 7.1, 7.5, 11.6, 16.2_
 */

import { WearableProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { NormalizedActivity } from "@/modules/shared/activities/contracts";

/** Arredonda para inteiro ou `null` (colunas `Int?`). */
function intOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

/** Retorna o número finito ou `null` (colunas `Float?`). */
function floatOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Lê uma string não-vazia de um registro cru, ou `null`. */
function rawString(raw: Record<string, unknown> | undefined, key: string): string | null {
  const value = raw?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Lê um número finito de um registro cru, ou `null`. */
function rawNumber(raw: Record<string, unknown> | undefined, key: string): number | null {
  const value = raw?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Colunas de `Activity` derivadas de uma `NormalizedActivity` do Strava, SEM
 * as chaves de propriedade (`userId`, `wearableConnectionId`) — o sync as
 * adiciona por serem contextuais à conexão. O objeto resultante é usado tanto no
 * `create` quanto no `update` do `activity.upsert`, garantindo idempotência.
 */
export type StravaActivityUpsertData = {
  externalId: string;
  provider: typeof WearableProvider.STRAVA;
  sportType: string;
  providerSportType: string;
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  movingSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  elevationGain: number | null;
  averageCadence: number | null;
  averagePower: number | null;
  maxPower: number | null;
  timezone: string | null;
  metrics: Prisma.JsonObject;
  rawPayload: Prisma.JsonObject;
};

/**
 * Converte uma `NormalizedActivity` (obrigatoriamente `source === "STRAVA"`) no
 * shape de persistência do model `Activity`.
 */
export function normalizedStravaActivityToActivityData(
  normalized: NormalizedActivity,
): StravaActivityUpsertData {
  const raw = normalized.raw;
  const durationSeconds = intOrNull(normalized.durationSeconds);
  const endedAt =
    durationSeconds !== null
      ? new Date(normalized.startedAt.getTime() + durationSeconds * 1000)
      : null;

  return {
    externalId: normalized.externalId,
    provider: WearableProvider.STRAVA,
    sportType: normalized.sportType,
    providerSportType: normalized.providerSportType,
    name: rawString(raw, "name"),
    startedAt: normalized.startedAt,
    endedAt,
    durationSeconds,
    movingSeconds: intOrNull(normalized.movingSeconds),
    distanceMeters: floatOrNull(normalized.distanceMeters),
    calories: intOrNull(rawNumber(raw, "calories") ?? undefined),
    averageHeartRate: intOrNull(normalized.averageHeartRate),
    maxHeartRate: intOrNull(normalized.maxHeartRate),
    averageSpeed: floatOrNull(normalized.averageSpeed),
    maxSpeed: floatOrNull(normalized.maxSpeed),
    elevationGain: floatOrNull(normalized.elevationGain),
    averageCadence: floatOrNull(normalized.averageCadence),
    averagePower: floatOrNull(normalized.averagePower),
    maxPower: floatOrNull(normalized.maxPower),
    timezone: rawString(raw, "timezone"),
    metrics: (raw ?? {}) as Prisma.JsonObject,
    rawPayload: (raw ?? {}) as Prisma.JsonObject,
  };
}
