/**
 * SAM-32 — zonas de FC do Strava com voltas já persistidas.
 *
 * A sync materializa as laps em `metrics.stravaActivityDetails.laps`, mas os
 * streams nunca são persistidos. Antes, laps em cache faziam o enriquecedor
 * pular a busca de streams e as seções "Zonas de frequência cardíaca" e
 * "Análise do treino" sumiam a partir do segundo acesso. Agora só a chamada de
 * laps é poupada: os streams continuam sendo buscados.
 */

import type { Activity } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StravaClient } from "@/modules/strava/api/client";
import { stravaStreamSetObjectSchema } from "@/modules/strava/api/schemas/strava-stream";
import {
  getStravaActivityVisualData,
  stravaActivityVisualCache,
} from "@/modules/strava/application/activities/strava-activity-details";

const HEART_RATES = [120, 135, 150, 162, 170, 178, 181, 160, 140];

function makeActivity(metrics: unknown): Activity {
  return {
    id: "activity-persisted-laps",
    userId: "user-under-test",
    wearableConnectionId: "connection-under-test",
    externalId: "987654321",
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
    metrics,
    rawPayload: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-02T09:00:00.000Z"),
  } as unknown as Activity;
}

function makeClient() {
  const getActivityStreams = vi.fn(async () =>
    stravaStreamSetObjectSchema.parse({
      time: {
        type: "generic",
        data: HEART_RATES.map((_, index) => index * 10),
        series_type: "time",
        original_size: HEART_RATES.length,
        resolution: "high",
      },
      heartrate: {
        type: "generic",
        data: [...HEART_RATES],
        series_type: "time",
        original_size: HEART_RATES.length,
        resolution: "high",
      },
    }),
  );
  const getActivityLaps = vi.fn(async () => []);

  return {
    client: { getActivityStreams, getActivityLaps } as unknown as StravaClient,
    getActivityStreams,
    getActivityLaps,
  };
}

const PERSISTED_LAPS = [
  {
    index: 1,
    durationSeconds: 1_350,
    distanceMeters: 5_000,
    averageHeartRate: 145,
    averageCadence: 86,
    averageSpeed: 3.7,
    averageWatts: null,
  },
  {
    index: 2,
    durationSeconds: 1_350,
    distanceMeters: 5_000,
    averageHeartRate: 155,
    averageCadence: 88,
    averageSpeed: 3.7,
    averageWatts: null,
  },
];

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  stravaActivityVisualCache.clear();
});

describe("getStravaActivityVisualData com laps persistidas (SAM-32)", () => {
  it("continua buscando streams e exibe zonas de FC e análise do treino, sem chamar laps", async () => {
    const { client, getActivityStreams, getActivityLaps } = makeClient();
    const activity = makeActivity({ stravaActivityDetails: { laps: PERSISTED_LAPS } });

    const visual = await getStravaActivityVisualData(activity, { client });

    expect(getActivityStreams).toHaveBeenCalledTimes(1);
    expect(getActivityLaps).not.toHaveBeenCalled();
    expect(visual).not.toBeNull();

    const barIds = visual!.barSections.map((section) => section.id);
    expect(barIds).toContain("heart-rate-zones");
    expect(barIds).toContain("splits");
    expect(visual!.metricSections.map((section) => section.title)).toContain("Análise do treino");
    expect(visual!.laps).toHaveLength(PERSISTED_LAPS.length);
  });

  it("sem laps persistidas busca streams e laps", async () => {
    const { client, getActivityStreams, getActivityLaps } = makeClient();

    await getStravaActivityVisualData(makeActivity(null), { client });

    expect(getActivityStreams).toHaveBeenCalledTimes(1);
    expect(getActivityLaps).toHaveBeenCalledTimes(1);
  });
});
