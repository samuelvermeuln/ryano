/**
 * SAM-39 — ingestão do detalhe rico: persistência idempotente por provider,
 * zonas derivadas quando o provider não tem, nunca lança, backfill paginado
 * que para no rate limit.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/shared/integrations/observability/log", () => ({ logIntegrationEvent: vi.fn() }));

import { normalizedActivityDetailSchema, type NormalizedActivityDetail } from "@/modules/shared/activities/contracts";
import { BackfillActivityDetail } from "@/modules/shared/activities/detail-ingestion/backfill-activity-detail";
import {
  completeDetail,
  deriveHeartRateZoneSet,
  ingestActivityDetail,
  persistActivityDetail,
  statsToActivityUpdate,
} from "@/modules/shared/activities/detail-ingestion";

function makeTx() {
  const tx = {
    activityLap: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    activityZone: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    activityStream: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    activity: { update: vi.fn().mockResolvedValue({}) },
  };
  const db = { $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)) };
  return { db, tx };
}

const detail: NormalizedActivityDetail = normalizedActivityDetailSchema.parse({
  provider: "STRAVA",
  externalId: "123",
  laps: [{ lapNumber: 1, durationSeconds: 600.4, distanceMeters: 2000, averageHeartRate: 142.6 }],
  streams: [
    { key: "time", values: [0, 60, 120, 180], source: { provider: "STRAVA", kind: "native" } },
    { key: "heartRate", values: [120, 150, null, 170], source: { provider: "STRAVA", kind: "native" } },
    { key: "latlng", values: [[-23.5, -46.6], null, [-23.51, -46.61], [-23.52, -46.62]], source: { provider: "STRAVA", kind: "native" } },
  ],
  stats: { elapsedSeconds: 1900, routePolyline: "abc", averageTemperature: 24 },
  sources: { laps: { provider: "STRAVA", kind: "native" }, streams: { provider: "STRAVA", kind: "native" }, stats: { provider: "STRAVA", kind: "native" } },
});

const ACTIVITY = {
  id: "act-1", userId: "u", wearableConnectionId: "c", provider: "STRAVA" as const, externalId: "123",
  maxHeartRate: 185, averageHeartRate: 150, detailSyncedAt: null,
};

describe("persistActivityDetail", () => {
  it("substitui só as linhas do mesmo provider, grava as séries em uma linha por chave e só as stats presentes", async () => {
    const { db, tx } = makeTx();
    const now = new Date("2026-10-02T12:00:00.000Z");

    const result = await persistActivityDetail(db as never, "act-1", detail, now);

    expect(result).toEqual({ laps: 1, zones: 0, streams: 3, statsWritten: 3 });
    expect(tx.activityLap.deleteMany).toHaveBeenCalledWith({ where: { activityId: "act-1", sourceProvider: "STRAVA" } });
    expect(tx.activityLap.createMany.mock.calls[0][0].data[0]).toMatchObject({
      activityId: "act-1", lapNumber: 1, sourceProvider: "STRAVA", sourceKind: "NATIVE", durationSeconds: 600, averageHeartRate: 143, distanceMeters: 2000, calories: null,
    });
    expect(tx.activityZone.deleteMany).not.toHaveBeenCalled();
    const streams = tx.activityStream.createMany.mock.calls[0][0].data;
    expect(streams.map((s: { key: string; sampleCount: number }) => [s.key, s.sampleCount])).toEqual([["TIME", 4], ["HEART_RATE", 3], ["LATLNG", 3]]);
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: "act-1" },
      data: { elapsedSeconds: 1900, routePolyline: "abc", averageTemperature: 24, detailSyncedAt: now },
    });
  });

  it("ausência ≠ zero: uma stat null nunca vira 0 nem entra no update", () => {
    const update = statsToActivityUpdate(normalizedActivityDetailSchema.shape.stats.parse({ averageSwolf: null, totalStrokes: 412.4 }));
    expect(update).toEqual({ totalStrokes: 412 });
  });
});

describe("deriveHeartRateZoneSet / completeDetail", () => {
  it("deriva 5 zonas de %FCmáx do stream de FC, rotuladas 'derived' com a referência usada", () => {
    const set = deriveHeartRateZoneSet(detail, { maxHeartRate: 185, averageHeartRate: 150 })!;
    expect(set.zoneType).toBe("HEART_RATE");
    expect(set.source).toEqual({ provider: "STRAVA", kind: "derived" });
    expect(set.configurationRef).toBe("max-hr:185");
    expect(set.zones).toHaveLength(5);
    // 3 intervalos de 60 s atribuídos à zona da amostra anterior; a lacuna (null) é pulada.
    expect(set.zones.reduce((sum, zone) => sum + zone.durationSeconds, 0)).toBe(180);
  });

  it("sem referência de FC máxima ou sem stream, nada é inventado; com zonas nativas, nada é derivado", () => {
    expect(deriveHeartRateZoneSet(detail, { maxHeartRate: null, averageHeartRate: null })).toBeNull();
    expect(deriveHeartRateZoneSet({ provider: "STRAVA", streams: [] }, { maxHeartRate: 185 })).toBeNull();
    const native = { ...detail, zones: [{ zoneType: "HEART_RATE" as const, source: { provider: "GARMIN" as const, kind: "native" as const }, configurationRef: null, zones: [{ zoneNumber: 1, label: null, lowerBound: null, upperBound: null, durationSeconds: 10 }] }] };
    expect(completeDetail(native, ACTIVITY)).toEqual({ detail: native, derivedZones: false });
    const completed = completeDetail(detail, ACTIVITY);
    expect(completed.derivedZones).toBe(true);
    expect(completed.detail.sources.zones).toEqual({ provider: "STRAVA", kind: "derived" });
  });
});

describe("ingestActivityDetail", () => {
  it("ingere, deriva as zonas e marca detailSyncedAt; já sincronizada é pulada sem chamar o provider", async () => {
    const { db, tx } = makeTx();
    const loader = vi.fn().mockResolvedValue(detail);

    const result = await ingestActivityDetail(db as never, ACTIVITY, loader, { now: () => new Date("2026-10-02T12:00:00.000Z") });

    expect(result).toMatchObject({ status: "ingested", derivedZones: true, persisted: { laps: 1, zones: 5, streams: 3 } });
    expect(tx.activityZone.createMany.mock.calls[0][0].data[0]).toMatchObject({ sourceKind: "DERIVED", configurationRef: "max-hr:185" });

    const skipped = await ingestActivityDetail(db as never, { ...ACTIVITY, detailSyncedAt: new Date() }, loader);
    expect(skipped).toEqual({ status: "skipped", reason: "already-synced" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("nunca lança: provider sem detalhe → skipped; erro → failed, com rate limit sinalizado", async () => {
    const { db } = makeTx();
    expect(await ingestActivityDetail(db as never, ACTIVITY, async () => null)).toEqual({ status: "skipped", reason: "no-detail" });
    class RateLimit extends Error { name = "RateLimit"; }
    const result = await ingestActivityDetail(db as never, ACTIVITY, async () => { throw new RateLimit("429"); }, {
      isRateLimitError: (error) => error instanceof RateLimit,
    });
    expect(result).toEqual({ status: "failed", errorName: "RateLimit", rateLimited: true });
  });
});

describe("BackfillActivityDetail", () => {
  function makeDb(rows: Array<Record<string, unknown>>) {
    const { db, tx } = makeTx();
    return { db: { ...db, activity: { findMany: vi.fn().mockResolvedValue(rows) } }, tx };
  }
  const row = (id: string, provider: "STRAVA" | "GARMIN") => ({
    ...ACTIVITY, id, provider, startedAt: new Date("2026-09-30T10:00:00.000Z"),
  });

  it("pagina só as não sincronizadas do provider com loader e devolve o cursor", async () => {
    const { db } = makeDb([row("a", "STRAVA"), row("b", "STRAVA"), row("c", "GARMIN")]);
    const strava = vi.fn().mockResolvedValue(detail);

    const result = await new BackfillActivityDetail(db as never, { STRAVA: strava }, { clock: () => new Date("2026-10-02T12:00:00.000Z") })
      .execute({ limit: 2 });

    expect(db.activity.findMany.mock.calls[0][0].where).toMatchObject({ provider: { in: ["STRAVA"] }, detailSyncedAt: null });
    expect(db.activity.findMany.mock.calls[0][0].take).toBe(3);
    expect(result).toEqual({ processed: 2, ingested: 2, skipped: 0, failed: 0, rateLimited: false, nextCursor: "b" });
  });

  it("para no primeiro rate limit e aponta o cursor para retomar sem pular a atividade", async () => {
    const { db } = makeDb([row("a", "STRAVA"), row("b", "STRAVA"), row("c", "STRAVA")]);
    class RateLimit extends Error {}
    const strava = vi.fn()
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(new RateLimit("429"));

    const result = await new BackfillActivityDetail(db as never, { STRAVA: strava }, { isRateLimitError: (error) => error instanceof RateLimit })
      .execute({ limit: 10 });

    expect(result).toMatchObject({ processed: 2, ingested: 1, failed: 1, rateLimited: true, nextCursor: "a" });
    expect(strava).toHaveBeenCalledTimes(2);
  });
});
