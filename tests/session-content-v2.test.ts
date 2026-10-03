/**
 * SAM-69 — session builder v2 totals (§11, AC16, AC17).
 */
import { describe, expect, it } from "vitest";

import { flattenToV1, fromV1, pauseCount, sessionContentV2Schema, sessionTotals, titleDivergence, type SessionContentV2 } from "@/modules/school/domain/session-content-v2";
import { plannedTotals } from "@/modules/school/domain/workout-structure";

const time = (minutes: number) => ({ kind: "STEP", duration: { type: "TIME", seconds: minutes * 60 } });
const dist = (value: number) => ({ kind: "STEP", duration: { type: "DISTANCE", value } });
const set = (repetitions: number, children: unknown[], restSeconds?: number | null, extra: Record<string, unknown> = {}) => ({
  kind: "SET", repetitions, children, rest: restSeconds === undefined ? null : { position: "BETWEEN_REPS", seconds: restSeconds }, ...extra,
});
const session = (blocks: Array<{ type: string; name: string; children: unknown[] }>, pool?: { length: number; unit: "m" | "yd" }): SessionContentV2 =>
  sessionContentV2Schema.parse({ schemaVersion: 2, pool, blocks });

const NAT_PISC_001 = session([
  { type: "WARMUP", name: "Aquecimento", children: [dist(200), dist(100)] },
  { type: "TECHNIQUE", name: "Técnica", children: [set(4, [dist(50)])] },
  { type: "MAIN", name: "Principal", children: [set(6, [dist(100)], 20)] },
  { type: "CUSTOM", name: "Habilidade", children: [set(4, [dist(50)])] },
  { type: "COOLDOWN", name: "Soltura", children: [dist(100)] },
], { length: 25, unit: "m" });

describe("totais dos modelos do documento (AC17)", () => {
  it("NAT-PISC-001 = 1.400 m; duração depende do ritmo (não exata)", () => {
    const totals = sessionTotals(NAT_PISC_001);
    expect(totals).toMatchObject({ distance: 1400, distanceUnit: "m", durationExact: false, recoverySeconds: 100 });
    expect(totals.durationNotes[0]).toContain("depende do ritmo");
  });

  it("COR-001 = 40 min (10 + 18 + 4 + 8), exato", () => {
    const totals = sessionTotals(session([
      { type: "WARMUP", name: "Aquecimento", children: [time(10)] },
      { type: "MAIN", name: "Principal", children: [set(3, [time(6)], 120)] },
      { type: "COOLDOWN", name: "Final", children: [time(8)] },
    ]));
    expect(totals).toMatchObject({ effortSeconds: 36 * 60, recoverySeconds: 4 * 60, totalSeconds: 40 * 60, durationExact: true });
  });

  it("CIC-001 = 55 min; NAT-AA-001 = 46 min; TRI-BRICK-001 = 65 min (60 + 5 de transição)", () => {
    expect(sessionTotals(session([
      { type: "WARMUP", name: "Aquecimento", children: [time(15)] },
      { type: "MAIN", name: "Principal", children: [set(3, [time(8)], 180)] },
      { type: "COOLDOWN", name: "Final", children: [time(10)] },
    ])).totalSeconds).toBe(55 * 60);
    expect(sessionTotals(session([
      { type: "WARMUP", name: "Início", children: [time(8)] },
      { type: "TECHNIQUE", name: "Técnica", children: [set(6, [time(1)], 60)] },
      { type: "MAIN", name: "Principal", children: [set(3, [time(6)], 120)] },
      { type: "COOLDOWN", name: "Final", children: [time(5)] },
    ])).totalSeconds).toBe(46 * 60);
    const brick = sessionTotals(session([
      { type: "MAIN", name: "Bike", children: [time(10), time(30), time(5)] },
      { type: "TRANSITION", name: "Transição", children: [time(5)] },
      { type: "MAIN", name: "Corrida", children: [time(5), time(10)] },
    ]));
    expect(brick.totalSeconds).toBe(65 * 60);
  });
});

describe("recuperação sem ambiguidade (§11.2)", () => {
  it("6 × 100 com 20 s = 5 pausas; com descanso após a última, 6; saindo a cada 2:00 a duração é estimada", () => {
    const withRest = set(6, [dist(100)], 20);
    expect(pauseCount({ repetitions: 6, rest: { position: "BETWEEN_REPS", seconds: 20, active: false, countsInTotal: true }, sendOffSeconds: null })).toBe(5);
    expect(pauseCount({ repetitions: 6, rest: { position: "AFTER_ALL", seconds: 20, active: false, countsInTotal: true }, sendOffSeconds: null })).toBe(6);
    expect(sessionTotals(session([{ type: "MAIN", name: "P", children: [withRest] }])).recoverySeconds).toBe(100);
    const sendOff = sessionTotals(session([{ type: "MAIN", name: "P", children: [set(6, [dist(100)], undefined, { sendOffSeconds: 120 })] }]));
    expect(sendOff).toMatchObject({ totalSeconds: 12 * 60, durationExact: false });
    expect(sendOff.durationNotes).toContain("intervalo de saída: o descanso depende do tempo executado");
  });

  it("séries aninhadas multiplicam; recuperação completa sem valor e término manual tiram a exatidão", () => {
    const nested = sessionTotals(session([{ type: "MAIN", name: "P", children: [set(2, [set(4, [time(1)], 30)], 120)] }]));
    expect(nested).toMatchObject({ effortSeconds: 8 * 60, recoverySeconds: 2 * 90 + 120, durationExact: true });
    expect(sessionTotals(session([{ type: "MAIN", name: "P", children: [set(3, [time(5)], null)] }])).durationNotes).toContain("recuperação completa sem valor");
    expect(sessionTotals(session([{ type: "MAIN", name: "P", children: [{ kind: "STEP", duration: { type: "MANUAL" } }] }])).durationExact).toBe(false);
  });
});

describe("título e unidades", () => {
  it("título '1.400 m' com blocos somando 1.900 m mostra a divergência", () => {
    const longer = session([...NAT_PISC_001.blocks, { type: "MAIN", name: "Extra", children: [set(5, [dist(100)])] }], { length: 25, unit: "m" });
    expect(titleDivergence("Natação iniciante — 1.400 m", sessionTotals(longer))).toBe("O título declara 1.400 m, mas os blocos somam 1.900 m.");
    expect(titleDivergence("NAT-PISC-001 — 1.400 m", sessionTotals(NAT_PISC_001))).toBeNull();
  });

  it("piscina de 25 jardas nunca vira metros (AC16)", () => {
    const yards = session([{ type: "MAIN", name: "P", children: [set(4, [dist(100)])] }], { length: 25, unit: "yd" });
    expect(sessionTotals(yards)).toMatchObject({ distance: 400, distanceUnit: "yd" });
    expect(flattenToV1(yards)[0]!.distanceM).toBeNull();
    expect(titleDivergence("Série 400 m", sessionTotals(yards))).toContain("não converto sem método");
  });
});

describe("compatibilidade com v1", () => {
  it("prescrição v1 lida como v2 calcula o mesmo total; achatar v2 devolve linhas v1 equivalentes", () => {
    const rows = [
      { blockType: "WARMUP", title: "Aq", durationS: 600, distanceM: null, repetitions: null, restDurationS: null },
      { blockType: "INTERVAL", title: "Tiros", durationS: 360, distanceM: null, repetitions: 3, restDurationS: 120 },
      { blockType: "COOLDOWN", title: "Final", durationS: 480, distanceM: null, repetitions: null, restDurationS: null },
    ];
    const v1 = plannedTotals(rows.map((row) => ({ ...row, targetPayload: null, restPayload: row.restDurationS ? { durationS: row.restDurationS } : null })));
    expect(sessionTotals(fromV1(rows)).totalSeconds).toBe(v1.durationSeconds);
    const flat = flattenToV1(fromV1(rows));
    expect(flat.map((row) => [row.durationS, row.repetitions, row.restDurationS])).toEqual([[600, null, null], [360, 3, 120], [480, null, null]]);
  });
});
