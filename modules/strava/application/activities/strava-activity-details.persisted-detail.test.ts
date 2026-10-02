/**
 * SAM-39 — tabelas primeiro: com voltas e séries já ingeridas no modelo rico,
 * o enriquecedor do Strava não chama a API; com só voltas persistidas, só os
 * streams são buscados.
 */
import type { Activity } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizedActivityDetailSchema } from "@/modules/shared/activities/contracts";
import type { StravaClient } from "@/modules/strava/api/client";
import {
  STRAVA_SPLITS_SECTION_ID,
  getStravaActivityVisualData,
  persistedStreamsToParsed,
  stravaActivityVisualCache,
} from "@/modules/strava/application/activities/strava-activity-details";

function makeActivity(): Activity {
  return {
    id: "activity-persisted-detail",
    userId: "user-under-test",
    wearableConnectionId: "connection-under-test",
    externalId: "123123",
    provider: "STRAVA",
    providerSportType: "Run",
    sportType: "run",
    name: "Corrida",
    startedAt: new Date("2026-10-02T07:40:00.000Z"),
    endedAt: null,
    durationSeconds: 2_700,
    movingSeconds: 2_650,
    distanceMeters: 10_000,
    calories: 620,
    averageHeartRate: 148,
    maxHeartRate: 186,
    averagePace: 270,
    averageSpeed: 3.7,
    maxSpeed: 4.4,
    elevationGain: 120,
    averageCadence: 86,
    averagePower: null,
    maxPower: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-02T09:00:00.000Z"),
  } as unknown as Activity;
}

const source = { provider: "STRAVA" as const, kind: "native" as const };
const PERSISTED = normalizedActivityDetailSchema.parse({
  provider: "STRAVA",
  externalId: "123123",
  laps: [
    { lapNumber: 1, durationSeconds: 300, distanceMeters: 1000, averageHeartRate: 140, averageSpeed: 3.3 },
    { lapNumber: 2, durationSeconds: 290, distanceMeters: 1000, averageHeartRate: 150, averageSpeed: 3.4 },
  ],
  streams: [
    { key: "time", values: [0, 60, 120, 180, 240], source },
    { key: "heartRate", values: [120, 150, null, 170, 180], source },
  ],
  sources: { laps: source, streams: source },
});

function makeClient() {
  const getActivityStreams = vi.fn(async () => { throw new Error("API must not be called"); });
  const getActivityLaps = vi.fn(async () => { throw new Error("API must not be called"); });
  return { client: { getActivityStreams, getActivityLaps } as unknown as StravaClient, getActivityStreams, getActivityLaps };
}

describe("getStravaActivityVisualData — persistedDetail (SAM-39)", () => {
  beforeEach(() => stravaActivityVisualCache.clear());

  it("voltas e séries persistidas: nenhuma chamada; zonas de FC e voltas vêm do modelo rico", async () => {
    const { client, getActivityStreams, getActivityLaps } = makeClient();

    const visual = await getStravaActivityVisualData(makeActivity(), { client, persistedDetail: PERSISTED });

    expect(getActivityStreams).not.toHaveBeenCalled();
    expect(getActivityLaps).not.toHaveBeenCalled();
    expect(visual).not.toBeNull();
    expect(visual!.barSections.map((section) => section.id)).toContain(STRAVA_SPLITS_SECTION_ID);
    expect(visual!.barSections.some((section) => section.id !== STRAVA_SPLITS_SECTION_ID)).toBe(true); // zonas de FC
    expect(visual!.laps?.map((lap) => lap.index)).toEqual([1, 2]);
  });

  it("só voltas persistidas: busca os streams, não as voltas", async () => {
    const { client, getActivityStreams, getActivityLaps } = makeClient();
    getActivityStreams.mockResolvedValueOnce({} as never);

    await getStravaActivityVisualData(makeActivity(), { client, persistedDetail: { ...PERSISTED, streams: [] } });

    expect(getActivityStreams).toHaveBeenCalledTimes(1);
    expect(getActivityLaps).not.toHaveBeenCalled();
  });

  it("lacunas das séries viram NaN alinhado ao índice, nunca amostras removidas", () => {
    const parsed = persistedStreamsToParsed(PERSISTED.streams);
    expect(parsed.map((stream) => stream.type)).toEqual(["time", "heartrate"]);
    expect(parsed[1]!.values).toHaveLength(5);
    expect(Number.isNaN(parsed[1]!.values[2])).toBe(true);
  });
});
