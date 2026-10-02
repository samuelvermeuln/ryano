/**
 * SAM-40 — o modelo da tela de atividade a partir de três origens: Garmin
 * nativo (voltas + zonas nativas, sem séries), Strava com zonas derivadas e
 * séries (percurso alinhado), e um provider fictício só com agregados (sem
 * detalhe rico: só o fallback por atividade). Ausência ≠ zero em tudo.
 */
import type { Activity } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { normalizedActivityDetailSchema } from "@/modules/shared/activities/contracts";
import { buildActivityDetailModel } from "@/modules/shared/activities/presentation/activity-detail-model";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import { resolveActivityDetailSources } from "@/modules/shared/activities/source-resolution";

const providerLabel = (id: string) => ({ GARMIN: "Garmin", STRAVA: "Strava", POLAR: "Polar" } as Record<string, string>)[id] ?? id;

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1", userId: "u", wearableConnectionId: "c", externalId: "x", provider: "GARMIN", sportType: "run", providerSportType: "running",
    name: "Morning Run", startedAt: new Date("2026-10-02T09:00:00.000Z"), endedAt: null, durationSeconds: 1800, movingSeconds: 1750,
    distanceMeters: 6000, calories: 420, averageHeartRate: 150, maxHeartRate: 180, averagePace: 300, averageSpeed: 3.33, maxSpeed: 4,
    elevationGain: 40, averageCadence: 170, averagePower: null, maxPower: null, timezone: null, metrics: null, rawPayload: null,
    createdAt: new Date(), updatedAt: new Date(),
    title: null, subSportType: null, timerSeconds: null, elapsedSeconds: null, caloriesActive: null, caloriesResting: null,
    estimatedSweatLossMl: null, totalStrokes: null, averageStrokeRate: null, maxStrokeRate: null, averageDistancePerStroke: null,
    averageSwolf: null, averageTemperature: null, minTemperature: null, maxTemperature: null, trainingLoad: null, aerobicEffect: null,
    aerobicEffectLabel: null, anaerobicEffect: null, anaerobicEffectLabel: null, energyImpact: null, energyLabel: null, routePolyline: null,
    startLatitude: null, startLongitude: null, endLatitude: null, endLongitude: null, duplicateOfActivityId: null, detailSyncedAt: null,
    ...overrides,
  } as Activity;
}

function makeVisual(overrides: Partial<ActivityVisualData> = {}): ActivityVisualData {
  return {
    sportLabel: "Corrida", sportKey: "run", provider: "GARMIN", startedAtLabel: "02/10/2026 06:00",
    heroStats: [
      { label: "Distância", value: "6,0 km", tone: "text-sky-300" },
      { label: "Duração", value: "30 min", tone: "text-emerald-300" },
      { label: "Ritmo", value: "5:00 /km", tone: "text-amber-300" },
    ],
    overviewMetrics: [
      { label: "Distância", value: "6,0 km" }, { label: "Calorias", value: "420 kcal" }, { label: "FC média", value: "150 bpm" }, { label: "Potência", value: "—" },
    ],
    barSections: [], metricSections: [],
    ...overrides,
  };
}

const native = { provider: "GARMIN" as const, kind: "native" as const };
const stravaNative = { provider: "STRAVA" as const, kind: "native" as const };

describe("buildActivityDetailModel — Garmin nativo", () => {
  const detail = normalizedActivityDetailSchema.parse({
    provider: "GARMIN", externalId: "x",
    laps: [
      { lapNumber: 1, durationSeconds: 300, distanceMeters: 1000, averageHeartRate: 145, maxHeartRate: 160, averageCadence: 172, averageSpeed: 3.33 },
      { lapNumber: 2, durationSeconds: 310, distanceMeters: 1000, averageHeartRate: 155, maxHeartRate: 170, averageCadence: 170, averageSpeed: 3.22 },
    ],
    zones: [{ zoneType: "HEART_RATE", source: native, configurationRef: null, zones: [1, 2, 3, 4, 5].map((n) => ({ zoneNumber: n, label: null, lowerBound: null, upperBound: null, durationSeconds: n * 60 })) }],
    stats: { trainingLoad: 48.2, aerobicEffect: 2.9, aerobicEffectLabel: "Base aeróbica", energyImpact: -18 },
    sources: { laps: native, zones: native, stats: native },
  });
  const rich = resolveActivityDetailSources([{ provider: "GARMIN", detail }])!;
  const activity = makeActivity({ trainingLoad: 48.2, aerobicEffect: 2.9, aerobicEffectLabel: "Base aeróbica", energyImpact: -18, energyLabel: "Body Battery", routePolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" });

  const model = buildActivityDetailModel({ activity, visualData: makeVisual(), rich, providerLabel });

  it("cabeçalho com 4 KPIs (herói + resumo sem '—'), título humanizado e origem", () => {
    expect(model.header.kpis.map((kpi) => kpi.label)).toEqual(["Distância", "Duração", "Ritmo", "Calorias"]);
    // `humanizeActivityLabel` traduz termos conhecidos — mesmo comportamento da tela anterior.
    expect(model.header.title).toBe("Morning Corrida");
    expect(model.header.providerLabel).toBe("Garmin");
  });

  it("voltas nativas em tabela: só colunas com dado, resumo com totais e médias ponderadas", () => {
    expect(model.laps!.vocabulary).toBe("split");
    expect(model.laps!.columns.map((column) => column.key)).toEqual(["duration", "distance", "pace", "avgHr", "maxHr", "cadence"]);
    expect(model.laps!.rows).toHaveLength(2);
    expect(model.laps!.rows[0]!.cells.pace).toBe("5:00 /km");
    expect(model.laps!.summary.cells.distance).toBe("2,0 km");
    expect(model.laps!.summary.cells.maxHr).toBe("170 bpm");
    expect(model.laps!.summary.cells.pace).toBe("5:05 /km");
    expect(model.laps!.sourceNote).toBe("Voltas: Garmin · nativo");
  });

  it("zonas nativas rotuladas com a origem; percurso decodificado da polyline (não alinhado às séries); sem séries", () => {
    expect(model.zones).toHaveLength(1);
    expect(model.zones[0]).toMatchObject({ id: "heart-rate", approximate: false, sourceNote: "Zonas nativas · Garmin" });
    expect(model.zones[0]!.items.map((item) => item.shareText)).toEqual(["7%", "13%", "20%", "27%", "33%"]);
    expect(model.route).toMatchObject({ alignedToTimeline: false });
    expect(model.route!.points).toHaveLength(3);
    expect(model.timeline).toBeNull();
  });

  it("estatísticas estendidas rotuladas pela origem; stats ausentes não geram linha", () => {
    const effect = model.stats.find((group) => group.id === "training-effect")!;
    expect(effect.sourceNote).toBe("Escala de Garmin");
    expect(effect.rows.map((row) => row.value)).toEqual(["48", "2.9 · Base aeróbica"]);
    const energy = model.stats.find((group) => group.id === "energy")!;
    expect(energy.rows).toEqual([{ label: "Impacto em Body Battery", value: "-18", note: "Garmin" }]);
    expect(model.stats.find((group) => group.id === "swim")).toBeUndefined();
    expect(model.stats.find((group) => group.id === "temperature")).toBeUndefined();
    expect(model.sources).toEqual(["Voltas: Garmin · nativo", "Zonas: Garmin · nativo"]);
  });
});

describe("buildActivityDetailModel — Strava com séries e zonas derivadas", () => {
  const detail = normalizedActivityDetailSchema.parse({
    provider: "STRAVA", externalId: "y",
    streams: [
      { key: "time", values: [0, 60, 120, 180], source: stravaNative },
      { key: "distance", values: [0, 200, null, 600], source: stravaNative },
      { key: "heartRate", values: [120, 150, null, 170], source: stravaNative },
      { key: "speed", values: [3, 3.5, 0, 4], source: stravaNative },
      { key: "latlng", values: [[-23.5, -46.6], [-23.51, -46.61], null, [-23.52, -46.62]], source: stravaNative },
    ],
    zones: [{ zoneType: "HEART_RATE", source: { provider: "STRAVA", kind: "derived" }, configurationRef: "max-hr:185", zones: [{ zoneNumber: 1, label: null, lowerBound: null, upperBound: null, durationSeconds: 120 }] }],
    sources: { streams: stravaNative, zones: { provider: "STRAVA", kind: "derived" } },
  });
  const rich = resolveActivityDetailSources([{ provider: "STRAVA", detail }])!;
  const model = buildActivityDetailModel({ activity: makeActivity({ provider: "STRAVA" }), visualData: makeVisual({ provider: "STRAVA" }), rich, providerLabel });

  it("séries: ritmo derivado da velocidade (invertido), FC; lacunas continuam null; eixo de distância presente", () => {
    expect(model.timeline!.series.map((series) => series.key)).toEqual(["pace", "heartRate"]);
    const pace = model.timeline!.series[0]!;
    expect(pace.inverted).toBe(true);
    expect(pace.values[2]).toBeNull(); // velocidade 0 não vira ritmo
    expect(model.timeline!.series[1]!.values).toEqual([120, 150, null, 170]);
    expect(model.timeline!.distance).toEqual([0, 200, null, 600]);
    expect(model.timeline!.sourceNote).toBe("Séries: Strava · nativo");
  });

  it("sem série de velocidade, o ritmo vem de distância ÷ tempo entre amostras (lacunas e paradas ficam null)", () => {
    const noSpeed = normalizedActivityDetailSchema.parse({
      provider: "GARMIN", externalId: "z",
      streams: [
        { key: "time", values: [0, 60, 120, 180], source: native },
        { key: "distance", values: [0, 200, 200, null], source: native },
      ],
      sources: { streams: native },
    });
    const resolved = resolveActivityDetailSources([{ provider: "GARMIN", detail: noSpeed }])!;
    const model = buildActivityDetailModel({ activity: makeActivity(), visualData: makeVisual(), rich: resolved, providerLabel });
    const pace = model.timeline!.series.find((series) => series.key === "pace")!;
    expect(pace.values[0]).toBeNull(); // sem amostra anterior
    expect(Math.round(pace.values[1]!)).toBe(300); // 200 m em 60 s = 5:00 /km
    expect(pace.values[2]).toBeNull(); // parado
    expect(pace.values[3]).toBeNull(); // lacuna
  });

  it("percurso vem do stream alinhado às séries, com a lacuna preservada", () => {
    expect(model.route!.alignedToTimeline).toBe(true);
    expect(model.route!.points).toHaveLength(4);
    expect(Number.isNaN(model.route!.points[2]![0])).toBe(true);
  });

  it("zonas derivadas aparecem como estimadas, com a FC máxima de referência; sem voltas → sem tabela", () => {
    expect(model.zones[0]).toMatchObject({ approximate: true, sourceNote: "Zonas estimadas pela Ryvano a partir da FC (FC máx. de referência 185 bpm)." });
    expect(model.laps).toBeNull();
  });
});

describe("buildActivityDetailModel — provider só com agregados (sem detalhe rico)", () => {
  const visual = makeVisual({
    provider: "POLAR",
    barSections: [{ id: "heart-rate-zones", title: "Zonas de FC", description: "", approximate: true, disclaimer: "Zonas estimadas por %FC máx.", items: [{ label: "Z1", valueText: "10 min", ratio: 1, color: "", seconds: 600 }] }],
    metricSections: [{ id: "workout-analysis", title: "Análise do treino", description: "d", metrics: [{ label: "x", value: "y" }] }],
    laps: [{ index: 1, durationSeconds: 600, distanceMeters: 2000, averageSpeed: 3.33, averageHeartRate: 140, maxHeartRate: null, averagePower: null, averageCadence: null }],
  });
  const model = buildActivityDetailModel({ activity: makeActivity({ provider: "POLAR", title: "Treino leve" }), visualData: visual, rich: null, providerLabel });

  it("cai no fallback da própria atividade: zonas/voltas/análise do enriquecimento legado; sem séries nem percurso; título editorial vence", () => {
    expect(model.header.title).toBe("Treino leve");
    expect(model.header.editorialTitle).toBe("Treino leve");
    expect(model.timeline).toBeNull();
    expect(model.route).toBeNull();
    expect(model.zones[0]).toMatchObject({ id: "heart-rate-zones", approximate: true, sourceNote: "Zonas estimadas por %FC máx." });
    expect(model.laps!.rows).toHaveLength(1);
    expect(model.laps!.columns.map((column) => column.key)).toEqual(["duration", "distance", "pace", "avgHr"]);
    expect(model.laps!.sourceNote).toBe("Voltas: Polar");
    expect(model.analysis).toHaveLength(1);
    expect(model.sources).toEqual([]);
    // Só o resumo adaptativo e a leitura de FC derivada dos agregados: nenhuma stat estendida inventada.
    expect(model.stats.map((group) => group.id)).toEqual(["summary", "heart-rate"]);
    expect(model.stats[0]!.title).toBe("Resumo do treino");
  });
});

describe("buildActivityDetailModel — natação", () => {
  it("vocabulário de voltas, ritmo /100 m e braçadas por minuto; grupo Natação com SWOLF", () => {
    const detail = normalizedActivityDetailSchema.parse({
      provider: "GARMIN", externalId: "s",
      laps: [{ lapNumber: 1, durationSeconds: 120, distanceMeters: 100, averageStrokeRate: 28, averageHeartRate: 130 }],
      sources: { laps: native },
    });
    const rich = resolveActivityDetailSources([{ provider: "GARMIN", detail }])!;
    const model = buildActivityDetailModel({
      activity: makeActivity({ sportType: "swim", totalStrokes: 540, averageSwolf: 41, averageStrokeRate: 28 }),
      visualData: makeVisual({ sportKey: "swim", sportLabel: "Natação" }),
      rich, providerLabel,
    });
    expect(model.laps!.vocabulary).toBe("lap");
    expect(model.laps!.columns.map((column) => column.key)).toEqual(["duration", "distance", "pace", "avgHr", "strokeRate"]);
    expect(model.laps!.rows[0]!.cells.pace).toBe("2:00 /100 m");
    expect(model.laps!.rows[0]!.cells.strokeRate).toBe("28 spm");
    expect(model.stats.find((group) => group.id === "swim")!.rows.map((row) => row.label)).toEqual(["Braçadas", "Frequência média de braçadas", "SWOLF médio"]);
  });
});
