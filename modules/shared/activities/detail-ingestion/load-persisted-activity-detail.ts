/**
 * SAM-39 — reads the rich model back into the canonical DTO, per provider
 * (one `NormalizedActivityDetail` per `sourceProvider` that wrote rows), so a
 * reader can hand the candidates to `resolveActivityDetailSources` (SAM-45)
 * and never touches a provider's raw JSON. `null` when nothing was ingested.
 */
import type { ActivityStreamKey, ActivityZoneType, PrismaClient } from "@prisma/client";
import type { ProviderId } from "@/modules/shared/integrations/types";
import {
  normalizedActivityDetailSchema,
  type MetricSource,
  type NormalizedActivityDetail,
  type NormalizedStreamKey,
  type ZoneType,
} from "../contracts/rich";

type DetailDb = Pick<PrismaClient, "activityLap" | "activityZone" | "activityStream">;

const ENUM_TO_STREAM_KEY: Record<ActivityStreamKey, NormalizedStreamKey> = {
  TIME: "time",
  DISTANCE: "distance",
  LATLNG: "latlng",
  ALTITUDE: "altitude",
  HEART_RATE: "heartRate",
  CADENCE: "cadence",
  STROKE_RATE: "strokeRate",
  POWER: "power",
  SPEED: "speed",
  TEMPERATURE: "temperature",
};

const ENUM_TO_ZONE_TYPE: Record<ActivityZoneType, ZoneType> = { HEART_RATE: "HEART_RATE", POWER: "POWER", PACE: "PACE" };

export type PersistedActivityDetail = { provider: ProviderId; detail: NormalizedActivityDetail };

function source(provider: string, kind: "NATIVE" | "DERIVED"): MetricSource {
  return { provider: provider as ProviderId, kind: kind === "DERIVED" ? "derived" : "native" };
}

export async function loadPersistedActivityDetail(
  db: DetailDb,
  activity: { id: string; externalId: string },
): Promise<PersistedActivityDetail[]> {
  const [laps, zones, streams] = await Promise.all([
    db.activityLap.findMany({ where: { activityId: activity.id }, orderBy: { lapNumber: "asc" } }),
    db.activityZone.findMany({ where: { activityId: activity.id }, orderBy: [{ zoneType: "asc" }, { zoneNumber: "asc" }] }),
    db.activityStream.findMany({ where: { activityId: activity.id } }),
  ]);
  const providers = new Set<string>([
    ...laps.map((lap) => lap.sourceProvider),
    ...zones.map((zone) => zone.sourceProvider),
    ...streams.map((stream) => stream.sourceProvider),
  ]);

  return [...providers].map((provider) => {
    const providerLaps = laps.filter((lap) => lap.sourceProvider === provider);
    const providerZones = zones.filter((zone) => zone.sourceProvider === provider);
    const providerStreams = streams.filter((stream) => stream.sourceProvider === provider);

    const zoneSets = [...new Set(providerZones.map((zone) => zone.zoneType))].map((zoneType) => {
      const rows = providerZones.filter((zone) => zone.zoneType === zoneType);
      const first = rows[0]!;
      return {
        zoneType: ENUM_TO_ZONE_TYPE[zoneType],
        source: source(provider, first.sourceKind),
        configurationRef: first.configurationRef,
        zones: rows.map((zone) => ({
          zoneNumber: zone.zoneNumber, label: zone.label, lowerBound: zone.lowerBound, upperBound: zone.upperBound, durationSeconds: zone.durationSeconds,
        })),
      };
    });

    const detail = normalizedActivityDetailSchema.parse({
      provider,
      externalId: activity.externalId,
      laps: providerLaps.map((lap) => ({
        lapNumber: lap.lapNumber, startedAt: lap.startedAt, durationSeconds: lap.durationSeconds, movingSeconds: lap.movingSeconds,
        distanceMeters: lap.distanceMeters, averagePace: lap.averagePace, averageSpeed: lap.averageSpeed,
        averageHeartRate: lap.averageHeartRate, maxHeartRate: lap.maxHeartRate, averageCadence: lap.averageCadence,
        averageStrokeRate: lap.averageStrokeRate, maxStrokeRate: lap.maxStrokeRate, averageDistancePerStroke: lap.averageDistancePerStroke,
        averagePower: lap.averagePower, calories: lap.calories, averageTemperature: lap.averageTemperature,
      })),
      zones: zoneSets,
      streams: providerStreams.map((stream) => ({
        key: ENUM_TO_STREAM_KEY[stream.key],
        values: stream.values,
        source: source(provider, stream.sourceKind),
      })),
      stats: {},
      sources: {
        ...(providerLaps.length > 0 ? { laps: source(provider, providerLaps[0]!.sourceKind) } : {}),
        ...(zoneSets.length > 0 ? { zones: zoneSets[0]!.source } : {}),
        ...(providerStreams.length > 0 ? { streams: source(provider, providerStreams[0]!.sourceKind) } : {}),
      },
    });
    return { provider: provider as ProviderId, detail };
  });
}
