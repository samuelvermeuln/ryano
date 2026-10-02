/**
 * SAM-45 — resolução de fonte: uma conexão por campo, rotulada; nada mesclado.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  normalizedActivityDetailSchema,
  normalizedDailyHealthSchema,
  type NormalizedActivityDetail,
  type NormalizedDailyHealth,
} from "@/modules/shared/activities/contracts";
import {
  findDuplicateSessions,
  rankProviders,
  resolveActivityDetailSources,
  resolveDailyHealthSources,
} from "@/modules/shared/activities/source-resolution";

type DetailInput = Omit<z.input<typeof normalizedActivityDetailSchema>, "externalId"> & { externalId?: string };

/** Input do schema (parcial, como um provider entrega) → DTO canônico com defaults. */
function detail(input: DetailInput): NormalizedActivityDetail {
  return normalizedActivityDetailSchema.parse({ externalId: "x", ...input });
}

const garmin = detail({
  provider: "GARMIN",
  laps: [{ lapNumber: 1, durationSeconds: 600 }, { lapNumber: 2, durationSeconds: 600 }],
  zones: [{ zoneType: "HEART_RATE", source: { provider: "GARMIN", kind: "native" }, zones: [{ zoneNumber: 1, durationSeconds: 300 }, { zoneNumber: 2, durationSeconds: 900 }] }],
  stats: { averageSwolf: 38, energyImpact: -24, energyLabel: "Body Battery" },
  sources: { laps: { provider: "GARMIN", kind: "native" }, zones: { provider: "GARMIN", kind: "native" }, stats: { provider: "GARMIN", kind: "native" } },
});

const strava = detail({
  provider: "STRAVA",
  laps: [{ lapNumber: 1, durationSeconds: 1200 }],
  zones: [{ zoneType: "HEART_RATE", source: { provider: "STRAVA", kind: "derived" }, zones: [{ zoneNumber: 1, durationSeconds: 1200 }] }],
  streams: [
    { key: "time", values: [0, 10, 20], source: { provider: "STRAVA", kind: "native" } },
    { key: "latlng", values: [[-23.5, -46.6], null, [-23.51, -46.61]], source: { provider: "STRAVA", kind: "native" } },
  ],
  sources: { laps: { provider: "STRAVA", kind: "native" }, zones: { provider: "STRAVA", kind: "derived" }, streams: { provider: "STRAVA", kind: "native" } },
});

describe("contratos canônicos (Zod)", () => {
  it("ausência ≠ zero: campos não enviados ficam null/vazios, nunca 0", () => {
    const parsed = detail({ provider: "POLAR" });
    expect(parsed.laps).toEqual([]);
    expect(parsed.stats.averageSwolf).toBeNull();
    expect(parsed.stats.trainingLoad).toBeNull();
    expect(parsed.sources).toEqual({});
    const health = normalizedDailyHealthSchema.parse({ provider: "FITBIT", date: "2026-10-02", timeZone: "America/Sao_Paulo", fetchedAt: new Date() });
    expect(health.sleepScore).toBeNull();
    expect(health.energyScore).toBeNull();
  });

  it("rejeita o que não é canônico: zona sem duração, série com chave desconhecida, data local malformada", () => {
    expect(() => detail({ provider: "GARMIN", zones: [{ zoneType: "HEART_RATE", source: { provider: "GARMIN", kind: "native" }, zones: [{ zoneNumber: 1 }] }] } as never)).toThrow();
    expect(() => detail({ provider: "GARMIN", streams: [{ key: "watts", values: [1], source: { provider: "GARMIN", kind: "native" } }] } as never)).toThrow();
    expect(() => normalizedDailyHealthSchema.parse({ provider: "GARMIN", date: "02/10/2026", timeZone: "UTC", fetchedAt: new Date() })).toThrow();
  });
});

describe("rankProviders", () => {
  it("preferidos primeiro, depois a ordem de chegada, sem repetir e sem inventar", () => {
    expect(rankProviders(["STRAVA", "GARMIN", "POLAR"], ["POLAR", "AMAZFIT"])).toEqual(["POLAR", "STRAVA", "GARMIN"]);
  });
});

describe("resolveActivityDetailSources", () => {
  it("um provider: tudo dele, cada bloco rotulado com a sua proveniência", () => {
    const resolved = resolveActivityDetailSources([{ provider: "STRAVA", detail: strava }])!;
    expect(resolved.primaryProvider).toBe("STRAVA");
    expect(resolved.laps).toHaveLength(1);
    expect(resolved.streams).toHaveLength(2);
    expect(resolved.sources).toEqual({
      laps: { provider: "STRAVA", kind: "native" },
      zones: { provider: "STRAVA", kind: "derived" },
      streams: { provider: "STRAVA", kind: "native" },
    });
  });

  it("combinação desligada (padrão do Policy Gate): a mesma sessão em duas conexões exibe UMA, a primária, inteira", () => {
    const resolved = resolveActivityDetailSources([{ provider: "STRAVA", detail: strava }, { provider: "GARMIN", detail: garmin }], { preferred: ["GARMIN"] })!;
    expect(resolved.primaryProvider).toBe("GARMIN");
    expect(resolved.laps).toHaveLength(2);
    expect(resolved.zones[0]!.source.kind).toBe("native");
    // O Garmin não tem séries: sem licença para combinar, não se pega a série do Strava.
    expect(resolved.streams).toEqual([]);
    expect(resolved.sources.streams).toBeUndefined();
    expect(resolved.stats.averageSwolf).toBe(38);
  });

  it("combinação liberada: por bloco a melhor fonte, rotulada — zonas nativas > derivadas, série com GPS, cada bloco inteiro de um provider", () => {
    const resolved = resolveActivityDetailSources([{ provider: "STRAVA", detail: strava }, { provider: "GARMIN", detail: garmin }], { combinationAllowed: true })!;
    expect(resolved.sources).toEqual({
      laps: { provider: "GARMIN", kind: "native" },
      zones: { provider: "GARMIN", kind: "native" },
      streams: { provider: "STRAVA", kind: "native" },
      stats: { provider: "GARMIN", kind: "native" },
    });
    expect(resolved.zones[0]!.zones).toHaveLength(2);
    expect(resolved.streams.map((stream) => stream.key)).toEqual(["time", "latlng"]);
  });

  it("provider sem o bloco: campo ausente, não zero; sem candidatos: null", () => {
    const resolved = resolveActivityDetailSources([{ provider: "POLAR", detail: detail({ provider: "POLAR" }) }])!;
    expect(resolved.laps).toEqual([]);
    expect(resolved.sources).toEqual({});
    expect(resolveActivityDetailSources([])).toBeNull();
  });
});

describe("resolveDailyHealthSources", () => {
  const base = { date: "2026-10-02", timeZone: "America/Sao_Paulo" };
  const garminDay: NormalizedDailyHealth = normalizedDailyHealthSchema.parse({ ...base, provider: "GARMIN", fetchedAt: new Date("2026-10-02T08:00:00Z"), restingHeartRate: 52, sleepScore: 81, energyScore: 74, energyLabel: "Body Battery", hrvLastNight: 61 });
  const polarDay: NormalizedDailyHealth = normalizedDailyHealthSchema.parse({ ...base, provider: "POLAR", fetchedAt: new Date("2026-10-02T09:00:00Z"), restingHeartRate: 50, sleepScore: null, energyScore: 60, energyLabel: "Nightly Recharge", steps: 8200 });

  it("uma fonte por campo: a preferida que tem o valor; cada valor sabe de onde veio", () => {
    const resolved = resolveDailyHealthSources([garminDay, polarDay], { preferred: ["POLAR"] })!;
    expect(resolved.values).toMatchObject({ restingHeartRate: 50, sleepScore: 81, energyScore: 60, energyLabel: "Nightly Recharge", hrvLastNight: 61, steps: 8200 });
    expect(resolved.sources).toMatchObject({ restingHeartRate: "POLAR", sleepScore: "GARMIN", energyScore: "POLAR", hrvLastNight: "GARMIN", steps: "POLAR" });
    expect(resolved.sources.readinessScore).toBeUndefined();
    expect(resolved.providers).toEqual(["POLAR", "GARMIN"]);
  });

  it("sem preferência, a ordem de chegada decide; registros do mesmo provider: o mais recente", () => {
    const stale = normalizedDailyHealthSchema.parse({ ...garminDay, fetchedAt: new Date("2026-10-01T23:00:00Z"), restingHeartRate: 99 });
    const resolved = resolveDailyHealthSources([stale, garminDay, polarDay])!;
    expect(resolved.values.restingHeartRate).toBe(52);
    expect(resolved.sources.restingHeartRate).toBe("GARMIN");
    expect(resolveDailyHealthSources([])).toBeNull();
  });
});

describe("findDuplicateSessions", () => {
  const swimGarmin = { id: "g1", provider: "GARMIN" as const, sportType: "open-water", startedAt: new Date("2026-10-02T13:00:00Z"), durationSeconds: 1477, distanceMeters: 672 };
  const swimStrava = { id: "s1", provider: "STRAVA" as const, sportType: "open-water", startedAt: new Date("2026-10-02T13:00:30Z"), durationSeconds: 1480, distanceMeters: 670 };

  it("a natação espelhada do Garmin no Strava é UMA sessão: mantém a conexão preferida", () => {
    expect(findDuplicateSessions([swimStrava, swimGarmin], { preferred: ["GARMIN"] })).toEqual([
      { keepId: "g1", duplicateId: "s1", keepProvider: "GARMIN", duplicateProvider: "STRAVA" },
    ]);
    expect(findDuplicateSessions([swimStrava, swimGarmin], { preferred: ["STRAVA"] })[0]!.keepId).toBe("s1");
  });

  it("modalidade diferente, início distante, volume incompatível ou mesmo provider nunca são duplicata", () => {
    expect(findDuplicateSessions([swimGarmin, { ...swimStrava, sportType: "bike" }])).toEqual([]);
    expect(findDuplicateSessions([swimGarmin, { ...swimStrava, startedAt: new Date("2026-10-02T13:30:00Z") }])).toEqual([]);
    expect(findDuplicateSessions([swimGarmin, { ...swimStrava, distanceMeters: 2000 }])).toEqual([]);
    expect(findDuplicateSessions([swimGarmin, { ...swimGarmin, id: "g2" }])).toEqual([]);
    // Sem duração nem distância em um dos lados, só o início próximo não basta.
    expect(findDuplicateSessions([swimGarmin, { ...swimStrava, durationSeconds: null, distanceMeters: null }])).toEqual([]);
  });
});
