/**
 * SAM-40 — a mesma sessão em duas conexões é resolvida como UM detalhe: as
 * tabelas das duas atividades (a mantida e a cópia) viram candidatos e a
 * resolução da SAM-45 escolhe por bloco/conexão sob a política.
 */
import { describe, expect, it, vi } from "vitest";
import { listSessionActivities, loadResolvedActivityDetail } from "@/modules/shared/activities/detail-ingestion";

const GARMIN = { id: "g1", externalId: "g", provider: "GARMIN" as const, duplicateOfActivityId: null };
const STRAVA = { id: "s1", externalId: "s", provider: "STRAVA" as const, duplicateOfActivityId: "g1" };

function makeDb() {
  return {
    activity: { findMany: vi.fn().mockResolvedValue([GARMIN, STRAVA]) },
    activityLap: { findMany: vi.fn().mockImplementation(async ({ where }: { where: { activityId: string } }) => (where.activityId === "g1"
      ? [{ activityId: "g1", lapNumber: 1, sourceProvider: "GARMIN", sourceKind: "NATIVE", startedAt: null, durationSeconds: 600, movingSeconds: null, distanceMeters: 2000, averagePace: null, averageSpeed: null, averageHeartRate: 140, maxHeartRate: null, averageCadence: null, averageStrokeRate: null, maxStrokeRate: null, averageDistancePerStroke: null, averagePower: null, calories: null, averageTemperature: null }]
      : [])) },
    activityZone: { findMany: vi.fn().mockResolvedValue([]) },
    activityStream: { findMany: vi.fn().mockImplementation(async ({ where }: { where: { activityId: string } }) => (where.activityId === "s1"
      ? [{ activityId: "s1", key: "HEART_RATE", sourceProvider: "STRAVA", sourceKind: "NATIVE", sampleCount: 2, values: [120, 150] }]
      : [])) },
  };
}

describe("listSessionActivities", () => {
  it("a partir da cópia chega à mantida e vice-versa, sem repetir", async () => {
    const db = makeDb();
    const fromMirror = await listSessionActivities(db as never, STRAVA);
    expect(fromMirror.map((row) => row.id).sort()).toEqual(["g1", "s1"]);
    expect(db.activity.findMany.mock.calls[0][0].where).toEqual({ OR: [{ id: "g1" }, { duplicateOfActivityId: "g1" }] });
  });
});

describe("loadResolvedActivityDetail", () => {
  it("uma sessão, um detalhe: sem combinação (política padrão) tudo vem da conexão da atividade aberta", async () => {
    const db = makeDb();
    const resolved = await loadResolvedActivityDetail(db as never, GARMIN);
    expect(resolved!.primaryProvider).toBe("GARMIN");
    expect(resolved!.laps).toHaveLength(1);
    expect(resolved!.streams).toEqual([]); // o Strava tem a série, mas combinar está desligado
    expect(resolved!.sources).toEqual({ laps: { provider: "GARMIN", kind: "native" } });

    const mirror = await loadResolvedActivityDetail(db as never, STRAVA);
    expect(mirror!.primaryProvider).toBe("STRAVA");
    expect(mirror!.streams).toHaveLength(1);
    expect(mirror!.laps).toEqual([]);
  });

  it("nada ingerido → null (a tela cai no fallback da atividade)", async () => {
    const db = makeDb();
    db.activityLap.findMany.mockResolvedValue([]);
    db.activityStream.findMany.mockResolvedValue([]);
    expect(await loadResolvedActivityDetail(db as never, GARMIN)).toBeNull();
  });
});
