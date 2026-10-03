/**
 * SAM-72 — comparison by block and repetition (§17.2, §17.4, §17.5, AC11).
 */
import { describe, expect, it } from "vitest";

import { bandOf, compareBlocks, directionOf, formatMetric, type Streams } from "@/modules/school/domain/block-comparison";
import type { StructuredBlock } from "@/modules/school/domain/workout-structure";

/** Samples every 10 s; `valueAt(second)` returns the metric or null (a gap). */
function streamsOf(totalSeconds: number, valueAt: (second: number) => number | null, key: "power" | "heartRate" = "power"): Streams {
  const time: number[] = [];
  const values: Array<number | null> = [];
  for (let second = 0; second <= totalSeconds; second += 10) {
    time.push(second);
    values.push(valueAt(second));
  }
  return { time, [key]: values };
}

const block = (fields: Partial<StructuredBlock> & { blockType: string }): StructuredBlock => ({
  title: null, durationS: null, distanceM: null, repetitions: null, targetPayload: null, restPayload: null, ...fields,
});

describe("aderência e cobertura juntas (§17.4, AC11)", () => {
  it("18 min previstos, 12 com medição válida, 9 na faixa → aderência 75% e cobertura 66,7%; aquecimento fora do denominador", () => {
    const blocks = [
      block({ blockType: "WARMUP", durationS: 600, targetPayload: { powerMin: 120, powerMax: 150 } }),
      block({ blockType: "INTERVAL", durationS: 360, repetitions: 3, targetPayload: { powerMin: 200, powerMax: 220 }, restPayload: { durationS: 120 } }),
    ];
    // Laps: warm-up 600, then 6' / 2' / 6' / 2' / 6'.
    const laps = [600, 360, 120, 360, 120, 360].map((durationSeconds) => ({ durationSeconds, distanceMeters: null }));
    const streams = streamsOf(1920, (second) => {
      if (second < 600) return 100; // warm-up far below its band — never enters the main series
      if (second < 960) return 210; // rep 1: in band
      if (second < 1080) return null; // rest
      if (second < 1260) return 210; // rep 2: first half in band
      if (second < 1440) return 260; // rep 2: second half above
      if (second < 1560) return null; // rest
      return null; // rep 3: no samples
    });
    const result = compareBlocks({ blocks, laps, streams });
    expect(result.main).toMatchObject({ adherencePct: 75, coveragePct: 66.7, evaluableSeconds: 1080, measuredSeconds: 720, insideSeconds: 540 });
    const main = result.blocks[1]!;
    expect(main.rows.map((row) => [row.adherencePct, row.coveragePct])).toEqual([[100, 100], [50, 100], [null, 0]]);
    expect(result.blocks[0]!.auxiliary).toBe(true);
  });

  it("bloco sem amostras fica 'não medido' e fora do cálculo; sessão sem amostras mostra a limitação, nunca um número", () => {
    const blocks = [
      block({ blockType: "INTERVAL", durationS: 300, targetPayload: { powerMin: 200, powerMax: 220 } }),
      block({ blockType: "STEADY", durationS: 300, targetPayload: { powerMin: 180, powerMax: 200 } }),
    ];
    const laps = [{ durationSeconds: 300, distanceMeters: null }, { durationSeconds: 300, distanceMeters: null }];
    const result = compareBlocks({ blocks, laps, streams: streamsOf(600, (second) => (second < 300 ? 210 : null)) });
    expect(result.blocks[1]!.notMeasured).toBe(true);
    expect(result.main).toMatchObject({ adherencePct: 100, coveragePct: 100 });

    const none = compareBlocks({ blocks, laps, streams: null });
    expect(none.main).toMatchObject({ adherencePct: null, coveragePct: null });
    expect(none.limitations.join(" ")).toContain("nunca estimadas");
  });
});

describe("repetições prevista / identificada / confirmada (§17.4)", () => {
  it("6 previstas, 5 identificadas pelas voltas, 6 confirmadas pelo aluno — as três visíveis", () => {
    const blocks = [block({ blockType: "INTERVAL", durationS: 60, repetitions: 6, targetPayload: { paceSecPerKmMin: 240, paceSecPerKmMax: 260 } })];
    const laps = Array.from({ length: 5 }, () => ({ durationSeconds: 60, distanceMeters: 240 }));
    const result = compareBlocks({ blocks, laps: laps.slice(0, 5), streams: null, confirmedRepetitions: { 0: 6 } });
    // 5 laps do not align with 6 prescribed repetitions without rest: identified is unknown, not invented.
    expect(result.blocks[0]!.repetitions).toEqual({ planned: 6, identified: null, confirmed: 6, method: null });
    const aligned = compareBlocks({ blocks: [block({ ...blocks[0]!, repetitions: 5 })], laps, streams: null, confirmedRepetitions: { 0: 6 } });
    expect(aligned.blocks[0]!.repetitions).toMatchObject({ planned: 5, identified: 5, confirmed: 6, method: "voltas alinhadas à estrutura" });
  });
});

describe("direção legível (§17.5)", () => {
  it("pace menor = mais rápido; potência maior = acima da faixa; tolerância do professor alarga a faixa", () => {
    const pace = bandOf({ paceSecPerKmMin: 300, paceSecPerKmMax: 320 })!;
    expect(directionOf(pace, 280)).toBe("FASTER");
    expect(directionOf(pace, 330)).toBe("SLOWER");
    expect(directionOf(pace, 310)).toBe("INSIDE");
    const power = bandOf({ powerMin: 200, powerMax: 220, heartRateMin: 140, heartRateMax: 150 })!;
    expect(power.metric).toBe("power");
    expect(directionOf(power, 240)).toBe("ABOVE");
    expect(directionOf(power, 180)).toBe("BELOW");
    expect(directionOf(bandOf({ powerMin: 200, powerMax: 220, tolerancePct: 10 })!, 240)).toBe("INSIDE");
    expect(formatMetric("pace", 280)).toBe("4:40 /km");
  });

  it("métrica principal escolhida na prescrição; a FC é só contexto e não reprova repetição por ritmo", () => {
    expect(bandOf({ paceSecPerKmMin: 300, paceSecPerKmMax: 320, heartRateMin: 140, heartRateMax: 150 })!.metric).toBe("pace");
    expect(bandOf({ paceSecPerKmMin: 300, paceSecPerKmMax: 320, heartRateMin: 140, heartRateMax: 150, primaryMetric: "heartRate" })!.metric).toBe("heartRate");
    const blocks = [block({ blockType: "INTERVAL", durationS: 120, targetPayload: { paceSecPerKmMin: 300, paceSecPerKmMax: 320, heartRateMin: 140, heartRateMax: 150 } })];
    // Pace in band (500 m in 155 s ≈ 5:10/km) with the heart rate far above its band: the repetition passes.
    const time = Array.from({ length: 13 }, (_, index) => index * 10);
    const streams: Streams = { time, distance: time.map((second) => (second * 500) / 155), heartRate: time.map(() => 178) };
    const result = compareBlocks({ blocks, laps: [{ durationSeconds: 120, distanceMeters: 387, averageHeartRate: 178 }], streams });
    expect(result.blocks[0]!.rows[0]).toMatchObject({ adherencePct: 100, direction: "INSIDE" });
  });
});
