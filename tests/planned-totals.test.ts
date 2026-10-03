/**
 * SAM-48 — one calculation of "planned" for every screen and use case
 * (§11.2–11.3 of docs/ryvano_treinos_eventos_acompanhamento.md, AC17).
 */
import { describe, expect, it } from "vitest";

import { plannedTotals, plannedTotalsOfRows, restPeriodsOf } from "@/modules/school/domain/workout-structure";

const block = (over: Record<string, unknown>) => ({
  blockType: "INTERVAL", title: null, durationS: null, distanceM: null, repetitions: null,
  targetPayload: null, restPayload: null, ...over,
});

describe("plannedTotals — rest between repetitions (§11.2)", () => {
  it("6 × 100 m com 20 s entre repetições tem cinco pausas, não seis", () => {
    expect(restPeriodsOf({ repetitions: 6 })).toBe(5);
    const totals = plannedTotals([block({ durationS: 100, distanceM: 100, repetitions: 6, restPayload: { durationS: 20 } })]);
    expect(totals.restSeconds).toBe(100);
    expect(totals.durationSeconds).toBe(6 * 100 + 5 * 20);
    expect(totals.distanceMeters).toBe(600);
  });

  it("bloco de uma repetição mantém o próprio descanso", () => {
    expect(restPeriodsOf({ repetitions: 1 })).toBe(1);
    expect(plannedTotals([block({ durationS: 600, restPayload: { durationS: 60 } })]).durationSeconds).toBe(660);
  });

  it("COR-001 (§14.4): 10 + 3 × 6 min com 2 min entre blocos + 8 = 40 min", () => {
    const totals = plannedTotals([
      block({ blockType: "WARMUP", durationS: 600 }),
      block({ durationS: 360, repetitions: 3, restPayload: { durationS: 120 } }),
      block({ blockType: "COOLDOWN", durationS: 480 }),
    ]);
    expect(totals.durationSeconds).toBe(40 * 60);
    expect(totals.mainDurationSeconds).toBe(18 * 60);
    expect(totals.durationIsPartial).toBe(false);
  });

  it("bloco só com distância: duração é parcial (estimada), nunca total exato", () => {
    const totals = plannedTotals([
      block({ blockType: "WARMUP", durationS: 600 }),
      block({ distanceM: 1000, repetitions: 4 }),
    ]);
    expect(totals.durationSeconds).toBe(600);
    expect(totals.durationIsPartial).toBe(true);
    expect(totals.distanceIsPartial).toBe(true);
  });

  it("nada prescrito: totais nulos, não zero", () => {
    const totals = plannedTotals([block({})]);
    expect(totals.durationSeconds).toBeNull();
    expect(totals.distanceMeters).toBeNull();
  });
});

describe("plannedTotalsOfRows — linhas do banco (Decimal) no mesmo cálculo", () => {
  it("aceita distância Decimal/string e sem blocos devolve nulos", () => {
    const decimal = { toNumber: () => 100, valueOf: () => "100" };
    const totals = plannedTotalsOfRows([
      { blockType: "INTERVAL", durationS: 100, distanceM: decimal, repetitions: 6, restPayload: { durationS: 20 } },
      { blockType: "COOLDOWN", durationS: 300, distanceM: "200", repetitions: null },
    ]);
    expect(totals.distanceMeters).toBe(800);
    expect(totals.durationSeconds).toBe(700 + 300);
    expect(plannedTotalsOfRows(null).durationSeconds).toBeNull();
    expect(plannedTotalsOfRows(undefined).distanceMeters).toBeNull();
  });
});
