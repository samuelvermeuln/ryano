/**
 * SAM-18 — tabelas de zonas (FC por 3 métodos, ritmo, potência, CSS), casos de
 * borda, e o mapeamento modalidade → tipo de alvo do builder.
 */
import { describe, expect, it } from "vitest";
import {
  availableHeartRateMethods,
  deriveHeartRateZoneTable,
  derivePaceZones,
  derivePowerZones,
  deriveSwimZones,
  deriveTrainingZones,
  type ZoneParameters,
} from "@/modules/school/domain/training-zones";
import { diffTrackedParameters } from "@/modules/school/domain/athlete-technical-sheet";
import {
  buildZoneOptions,
  formatTrackedValue,
  targetKindForCategory,
  targetKindForSport,
} from "@/modules/school/presentation/prescription-targets";

const EMPTY: ZoneParameters = {
  maxHeartRate: null, thresholdHeartRate: null, restingHeartRate: null,
  thresholdPaceSecPerKm: null, ftpWatts: null, cssSecPer100m: null, heartRateZoneMethod: null,
};

describe("zonas de FC — três métodos", () => {
  it("%FCmáx: as cinco faixas 50/60/70/80/90–100 de 200 bpm", () => {
    const table = deriveHeartRateZoneTable({ ...EMPTY, maxHeartRate: 200 });
    expect(table?.method).toBe("MAX_HR");
    expect(table?.zones.map((z) => [z.fromBpm, z.toBpm])).toEqual([[100, 120], [120, 140], [140, 160], [160, 180], [180, 200]]);
  });

  it("%HRR (Karvonen): repouso + % da reserva — 200 máx / 50 repouso", () => {
    const table = deriveHeartRateZoneTable({ ...EMPTY, maxHeartRate: 200, restingHeartRate: 50, heartRateZoneMethod: "HRR" });
    expect(table?.method).toBe("HRR");
    expect(table?.zones[0]).toMatchObject({ fromBpm: 125, toBpm: 140 });
    expect(table?.zones[4]).toMatchObject({ fromBpm: 185, toBpm: 200 });
  });

  it("%LTHR: 65–85 / 85–89 / 89–95 / 95–100 / >100 do limiar 170, topo limitado pela FCmáx", () => {
    const table = deriveHeartRateZoneTable({ ...EMPTY, maxHeartRate: 190, thresholdHeartRate: 170, heartRateZoneMethod: "LTHR" });
    expect(table?.method).toBe("LTHR");
    expect(table?.zones.map((z) => [z.fromBpm, z.toBpm])).toEqual([[111, 145], [145, 151], [151, 162], [162, 170], [170, 190]]);
    expect(table?.zones[4].toPercent).toBeNull();
    // Sem FCmáx o topo fica em 110% do limiar.
    expect(deriveHeartRateZoneTable({ ...EMPTY, thresholdHeartRate: 170, heartRateZoneMethod: "LTHR" })?.zones[4].toBpm).toBe(187);
  });

  it("casos de borda: só repouso sem máx não gera tabela; LTHR > máx não é oferecido; método impossível cai no primeiro possível", () => {
    expect(deriveHeartRateZoneTable({ ...EMPTY, restingHeartRate: 50 })).toBeNull();
    expect(availableHeartRateMethods({ ...EMPTY, restingHeartRate: 50 })).toEqual([]);
    expect(availableHeartRateMethods({ ...EMPTY, maxHeartRate: 170, thresholdHeartRate: 190 })).toEqual(["MAX_HR"]);
    // Pediu reserva sem repouso: devolve %FCmáx em vez de nada.
    expect(deriveHeartRateZoneTable({ ...EMPTY, maxHeartRate: 190, heartRateZoneMethod: "HRR" })?.method).toBe("MAX_HR");
    // Só limiar: LTHR é o único método e vira o default.
    expect(deriveHeartRateZoneTable({ ...EMPTY, thresholdHeartRate: 165 })?.method).toBe("LTHR");
  });
});

describe("ritmo, potência e natação", () => {
  it("ritmo: % da velocidade de limiar (5:00/km) — Z4 95–104%", () => {
    const zones = derivePaceZones(300)!;
    expect(zones).toHaveLength(5);
    expect(zones[3]).toMatchObject({ zone: 4, fromSec: 288, toSec: 316 });
    expect(zones[0]).toMatchObject({ fromSec: 375, toSec: null }); // mais lento que 6:15
    expect(zones[4]).toMatchObject({ fromSec: null, toSec: 288 }); // mais rápido que 4:48
    expect(derivePaceZones(null)).toBeNull();
  });

  it("potência: % do FTP (Coggan) — 250 W", () => {
    const zones = derivePowerZones(250)!;
    expect(zones.map((z) => [z.fromWatts, z.toWatts])).toEqual([[0, 138], [138, 188], [188, 225], [225, 263], [263, null]]);
    expect(derivePowerZones(0)).toBeNull();
  });

  it("natação: mesmas faixas aplicadas ao CSS (1:40/100 m)", () => {
    const zones = deriveSwimZones(100)!;
    expect(zones[3]).toMatchObject({ fromSec: 96, toSec: 105 });
  });

  it("deriveTrainingZones só preenche as famílias com parâmetro", () => {
    const zones = deriveTrainingZones({ ...EMPTY, maxHeartRate: 190, ftpWatts: 250 });
    expect(zones.heartRate?.method).toBe("MAX_HR");
    expect(zones.power).toHaveLength(5);
    expect(zones.pace).toBeNull();
    expect(zones.swim).toBeNull();
  });
});

describe("builder — modalidade → tipo de alvo e opções de zona", () => {
  it("decide pela categoria de exibição: ritmo/km, ritmo/100 m, potência ou nenhum", () => {
    expect(targetKindForCategory("endurance-pace")).toBe("pace");
    expect(targetKindForCategory("swim")).toBe("swimPace");
    expect(targetKindForCategory("cycling")).toBe("power");
    expect(targetKindForCategory("strength-studio")).toBeNull();
    expect(targetKindForSport("run")).toBe("pace");
    expect(targetKindForSport("trail-run")).toBe("pace");
    expect(targetKindForSport("open-water")).toBe("swimPace");
    expect(targetKindForSport("mtb")).toBe("power");
    expect(targetKindForSport("football")).toBeNull();
  });

  it("opções de zona rotuladas com a faixa; o valor preenchido é o meio da faixa (ou a borda da aberta)", () => {
    const options = buildZoneOptions(deriveTrainingZones({ ...EMPTY, maxHeartRate: 200, thresholdPaceSecPerKm: 300, ftpWatts: 250 }));
    expect(options.heartRate?.method).toBe("% FC máxima");
    expect(options.heartRate?.options[2]).toEqual({ zone: 3, label: "Z3 (140–160 bpm)", heartRateMin: 140, heartRateMax: 160 });
    expect(options.pace?.[3]).toMatchObject({ zone: 4, label: "Z4 (4:48 /km – 5:16 /km)", paceSeconds: 302 });
    expect(options.pace?.[0].label).toBe("Z1 (mais lento que 6:15 /km)");
    expect(options.power?.[4]).toEqual({ zone: 5, label: "Z5 (acima de 263 W)", power: 263 });
    expect(options.swimPace).toBeNull();
  });
});

describe("histórico de parâmetros", () => {
  it("diffTrackedParameters lista só o que mudou, com antes/depois", () => {
    expect(diffTrackedParameters(
      { maxHeartRate: 180, ftpWatts: 250, heartRateZoneMethod: null },
      { maxHeartRate: 190, ftpWatts: 250, heartRateZoneMethod: "LTHR", thresholdHeartRate: 170 },
    )).toEqual({
      maxHeartRate: { from: 180, to: 190 },
      thresholdHeartRate: { from: null, to: 170 },
      heartRateZoneMethod: { from: null, to: "LTHR" },
    });
    expect(diffTrackedParameters(null, {})).toEqual({});
  });

  it("formata cada valor na unidade do campo", () => {
    expect(formatTrackedValue("maxHeartRate", 190)).toBe("190 bpm");
    expect(formatTrackedValue("thresholdPaceSecPerKm", 255)).toBe("4:15 /km");
    expect(formatTrackedValue("cssSecPer100m", 100)).toBe("1:40 /100 m");
    expect(formatTrackedValue("ftpWatts", 250)).toBe("250 W");
    expect(formatTrackedValue("heartRateZoneMethod", "LTHR")).toBe("% FC de limiar");
    expect(formatTrackedValue("ftpWatts", null)).toBe("—");
  });
});
