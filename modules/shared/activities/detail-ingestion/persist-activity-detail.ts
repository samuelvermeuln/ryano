/**
 * SAM-39 — writes a canonical `NormalizedActivityDetail` into the rich model
 * (ADR-006): `ActivityLap`, `ActivityZone`, `ActivityStream` and the extended
 * stats columns of `Activity`. Provider-agnostic: whichever module produced
 * the DTO, the persistence is the same.
 *
 * Rules:
 * - Idempotent: the rows this provider wrote for the activity are replaced
 *   (one transaction); rows written by another provider are untouched.
 * - Absence is never zero: a stat the DTO does not carry is left as it was;
 *   it is never overwritten with `0`, and a `null` only clears what the same
 *   provider wrote before when the DTO explicitly carries `null` for a stat
 *   that previously had a value from the same source (we keep it simple: only
 *   non-null stats are written).
 * - `detailSyncedAt` marks the ingestion, so the backfill knows what is done.
 */
import type { ActivityStreamKey, ActivityZoneType, MetricSourceKind, Prisma, PrismaClient, WearableProvider } from "@prisma/client";
import type {
  MetricSource,
  NormalizedActivityDetail,
  NormalizedActivityStats,
  NormalizedStreamKey,
  ZoneType,
} from "../contracts/rich";

type IngestionDb = Pick<PrismaClient, "$transaction">;

const STREAM_KEY_TO_ENUM: Record<NormalizedStreamKey, ActivityStreamKey> = {
  time: "TIME",
  distance: "DISTANCE",
  latlng: "LATLNG",
  altitude: "ALTITUDE",
  heartRate: "HEART_RATE",
  cadence: "CADENCE",
  strokeRate: "STROKE_RATE",
  power: "POWER",
  speed: "SPEED",
  temperature: "TEMPERATURE",
};

const ZONE_TYPE_TO_ENUM: Record<ZoneType, ActivityZoneType> = {
  HEART_RATE: "HEART_RATE",
  POWER: "POWER",
  PACE: "PACE",
};

function sourceKind(source: MetricSource): MetricSourceKind {
  return source.kind === "derived" ? "DERIVED" : "NATIVE";
}

function toInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/** Only the stats the DTO actually carries; a missing value never becomes 0 nor clears a stored one. */
export function statsToActivityUpdate(stats: NormalizedActivityStats): Prisma.ActivityUpdateInput {
  const update: Prisma.ActivityUpdateInput = {};
  const put = <K extends keyof Prisma.ActivityUpdateInput>(key: K, value: Prisma.ActivityUpdateInput[K] | null) => {
    if (value !== null && value !== undefined) update[key] = value;
  };
  put("timerSeconds", toInt(stats.timerSeconds));
  put("elapsedSeconds", toInt(stats.elapsedSeconds));
  put("caloriesActive", toInt(stats.caloriesActive));
  put("caloriesResting", toInt(stats.caloriesResting));
  put("estimatedSweatLossMl", toInt(stats.estimatedSweatLossMl));
  put("totalStrokes", toInt(stats.totalStrokes));
  put("averageStrokeRate", stats.averageStrokeRate);
  put("maxStrokeRate", stats.maxStrokeRate);
  put("averageDistancePerStroke", stats.averageDistancePerStroke);
  put("averageSwolf", stats.averageSwolf);
  put("averageTemperature", stats.averageTemperature);
  put("minTemperature", stats.minTemperature);
  put("maxTemperature", stats.maxTemperature);
  put("trainingLoad", stats.trainingLoad);
  put("aerobicEffect", stats.aerobicEffect);
  put("aerobicEffectLabel", stats.aerobicEffectLabel);
  put("anaerobicEffect", stats.anaerobicEffect);
  put("anaerobicEffectLabel", stats.anaerobicEffectLabel);
  put("energyImpact", stats.energyImpact);
  put("energyLabel", stats.energyLabel);
  put("routePolyline", stats.routePolyline);
  put("startLatitude", stats.startLatitude);
  put("startLongitude", stats.startLongitude);
  put("endLatitude", stats.endLatitude);
  put("endLongitude", stats.endLongitude);
  put("subSportType", stats.subSportType);
  return update;
}

export type PersistActivityDetailResult = {
  laps: number;
  zones: number;
  streams: number;
  statsWritten: number;
};

export async function persistActivityDetail(
  db: IngestionDb,
  activityId: string,
  detail: NormalizedActivityDetail,
  now: Date = new Date(),
): Promise<PersistActivityDetailResult> {
  const provider = detail.provider as WearableProvider;
  const lapSource = detail.sources.laps ?? { provider: detail.provider, kind: "native" as const };
  const statsUpdate = statsToActivityUpdate(detail.stats);

  const laps: Prisma.ActivityLapCreateManyInput[] = detail.laps.map((lap) => ({
    activityId,
    lapNumber: lap.lapNumber,
    sourceProvider: lapSource.provider as WearableProvider,
    sourceKind: sourceKind(lapSource),
    startedAt: lap.startedAt,
    durationSeconds: toInt(lap.durationSeconds),
    movingSeconds: toInt(lap.movingSeconds),
    distanceMeters: lap.distanceMeters,
    averagePace: lap.averagePace,
    averageSpeed: lap.averageSpeed,
    averageHeartRate: toInt(lap.averageHeartRate),
    maxHeartRate: toInt(lap.maxHeartRate),
    averageCadence: lap.averageCadence,
    averageStrokeRate: lap.averageStrokeRate,
    maxStrokeRate: lap.maxStrokeRate,
    averageDistancePerStroke: lap.averageDistancePerStroke,
    averagePower: lap.averagePower,
    calories: toInt(lap.calories),
    averageTemperature: lap.averageTemperature,
  }));

  const zones: Prisma.ActivityZoneCreateManyInput[] = detail.zones.flatMap((set) =>
    set.zones.map((zone) => ({
      activityId,
      zoneType: ZONE_TYPE_TO_ENUM[set.zoneType],
      zoneNumber: zone.zoneNumber,
      label: zone.label,
      lowerBound: zone.lowerBound,
      upperBound: zone.upperBound,
      durationSeconds: Math.round(zone.durationSeconds),
      sourceProvider: set.source.provider as WearableProvider,
      sourceKind: sourceKind(set.source),
      configurationRef: set.configurationRef,
    })));

  const streams: Prisma.ActivityStreamCreateManyInput[] = detail.streams.map((stream) => ({
    activityId,
    key: STREAM_KEY_TO_ENUM[stream.key],
    sourceProvider: stream.source.provider as WearableProvider,
    sourceKind: sourceKind(stream.source),
    sampleCount: stream.values.filter((value) => value !== null).length,
    values: stream.values as Prisma.InputJsonValue,
  }));

  await db.$transaction(async (tx) => {
    // Replace what THIS provider wrote; another provider's rows stay (ADR-005).
    if (detail.laps.length > 0) {
      await tx.activityLap.deleteMany({ where: { activityId, sourceProvider: provider } });
      await tx.activityLap.createMany({ data: laps });
    }
    if (detail.zones.length > 0) {
      const types = [...new Set(zones.map((zone) => zone.zoneType))];
      await tx.activityZone.deleteMany({ where: { activityId, sourceProvider: provider, zoneType: { in: types } } });
      await tx.activityZone.createMany({ data: zones });
    }
    if (detail.streams.length > 0) {
      await tx.activityStream.deleteMany({ where: { activityId, sourceProvider: provider } });
      await tx.activityStream.createMany({ data: streams });
    }
    await tx.activity.update({
      where: { id: activityId },
      data: { ...statsUpdate, detailSyncedAt: now },
    });
  });

  return {
    laps: laps.length,
    zones: zones.length,
    streams: streams.length,
    statsWritten: Object.keys(statsUpdate).length,
  };
}
