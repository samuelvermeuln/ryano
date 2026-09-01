import { describe, expect, it } from "vitest";

import {
  HEART_RATE_ZONE_COUNT,
  HEART_RATE_ZONE_LABELS,
  computeHeartRateZonesFromStream,
  type HeartRateSample,
} from "@/modules/shared/activities/heart-rate-zones/compute-heart-rate-zones-from-stream";

const MAX_HR = 200;

function samplesEverySecond(bpmSeries: number[]): HeartRateSample[] {
  return bpmSeries.map((bpm, index) => ({ timeSeconds: index, bpm }));
}

describe("computeHeartRateZonesFromStream", () => {
  it("retorna null para série vazia", () => {
    expect(computeHeartRateZonesFromStream([], MAX_HR)).toBeNull();
  });

  it("retorna null para FC máxima de referência não positiva ou inválida", () => {
    const samples = samplesEverySecond([120, 130, 140]);

    expect(computeHeartRateZonesFromStream(samples, 0)).toBeNull();
    expect(computeHeartRateZonesFromStream(samples, -180)).toBeNull();
    expect(computeHeartRateZonesFromStream(samples, Number.NaN)).toBeNull();
  });

  it("produz exatamente 5 faixas rotuladas na ordem canônica", () => {
    const section = computeHeartRateZonesFromStream(samplesEverySecond([100, 150, 190]), MAX_HR);

    expect(section).not.toBeNull();
    expect(section?.items).toHaveLength(HEART_RATE_ZONE_COUNT);
    expect(section?.items.map((item) => item.label)).toEqual([...HEART_RATE_ZONE_LABELS]);
    expect(section?.approximate).toBe(true);
  });

  it("atribui o intervalo entre amostras à zona da amostra anterior", () => {
    // 0s-10s em 100bpm (50% -> zona 1), 10s-30s em 190bpm (95% -> zona 5).
    const section = computeHeartRateZonesFromStream(
      [
        { timeSeconds: 0, bpm: 100 },
        { timeSeconds: 10, bpm: 190 },
        { timeSeconds: 30, bpm: 120 },
      ],
      MAX_HR,
    );

    expect(section?.items[0]?.ratio).toBeCloseTo(10 / 30);
    expect(section?.items[4]?.ratio).toBeCloseTo(20 / 30);
    expect(section?.items[1]?.ratio).toBe(0);
    expect(section?.items[2]?.ratio).toBe(0);
    expect(section?.items[3]?.ratio).toBe(0);
  });

  it("distribui as amostras pelas faixas de %FCmáx com limite inferior inclusivo", () => {
    // Cada amostra cobre 1s; a última não integra tempo (não tem sucessora).
    const section = computeHeartRateZonesFromStream(
      samplesEverySecond([100, 120, 140, 160, 180, 180]),
      MAX_HR,
    );

    expect(section?.items.map((item) => item.ratio)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  });

  it("cobre o intervalo total mesmo com amostras fora de ordem, sem mutar a entrada", () => {
    const samples: HeartRateSample[] = [
      { timeSeconds: 20, bpm: 150 },
      { timeSeconds: 0, bpm: 100 },
      { timeSeconds: 10, bpm: 190 },
    ];
    const snapshot = samples.map((sample) => ({ ...sample }));

    const section = computeHeartRateZonesFromStream(samples, MAX_HR);
    const totalRatio = (section?.items ?? []).reduce((total, item) => total + item.ratio, 0);

    expect(totalRatio).toBeCloseTo(1);
    expect(samples).toEqual(snapshot);
  });

  it("é determinística: duas chamadas com a mesma entrada produzem o mesmo resultado", () => {
    const samples = samplesEverySecond([90, 130, 170, 195]);

    expect(computeHeartRateZonesFromStream(samples, MAX_HR)).toEqual(
      computeHeartRateZonesFromStream(samples, MAX_HR),
    );
  });

  it("trata série de uma única amostra como cobertura de tempo zero", () => {
    const section = computeHeartRateZonesFromStream([{ timeSeconds: 42, bpm: 150 }], MAX_HR);

    expect(section?.items).toHaveLength(HEART_RATE_ZONE_COUNT);
    expect(section?.items.every((item) => item.ratio === 0)).toBe(true);
  });
});
