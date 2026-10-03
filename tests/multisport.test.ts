/**
 * SAM-75 — triathlon and multisport (§16, §17.3, §22.5, AC13, ADR-003).
 */
import { describe, expect, it } from "vitest";

import { markDuplicateSession } from "@/modules/shared/activities/duplicate-sessions";
import {
  brickComparison, legsFromGarminTypedSplits, segmentsFromProviderLegs, segmentTotals, validateSelections, weeklySecondsCountedOnce,
} from "@/modules/shared/activities/domain/multisport";

describe("segmentos do provedor com T1/T2 (§21.1)", () => {
  it("três pernas com lacunas viram natação, T1, ciclismo, T2 e corrida; distâncias nunca somadas entre modalidades", () => {
    const segments = segmentsFromProviderLegs([
      { sport: "lap_swimming", startOffsetSeconds: 0, durationSeconds: 1500, distanceMeters: 1500 },
      { sport: "cycling", startOffsetSeconds: 1620, durationSeconds: 3900, distanceMeters: 40000 },
      { sport: "running", startOffsetSeconds: 5580, durationSeconds: 2700, distanceMeters: 10000 },
    ]);
    expect(segments.map((segment) => segment.kind)).toEqual(["SWIM", "T1", "BIKE", "T2", "RUN"]);
    expect(segments[1]).toMatchObject({ startOffsetSeconds: 1500, endOffsetSeconds: 1620, durationSeconds: 120, distanceMeters: null });
    const totals = segmentTotals(segments);
    expect(totals.transitionSeconds).toBe(180);
    expect(totals.totalSeconds).toBe(1500 + 120 + 3900 + 60 + 2700);
    expect(totals.bySport).toEqual({ swim: { seconds: 1500, meters: 1500 }, bike: { seconds: 3900, meters: 40000 }, run: { seconds: 2700, meters: 10000 } });
    expect(totals.legend).toContain("não são somadas entre modalidades");
  });

  it("lê as pernas dos typedSplits persistidos do Garmin", () => {
    const legs = legsFromGarminTypedSplits({ garminActivityDetails: { typedSplits: [
      { sportType: "SWIMMING", elapsedDuration: 1500, distance: 1500 },
      { sportType: "TRANSITION", elapsedDuration: 120 },
      { sportType: "CYCLING", elapsedDuration: 3900, distance: 40000 },
    ] } });
    expect(legs.map((leg) => [leg.sport, leg.startOffsetSeconds, leg.durationSeconds])).toEqual([["SWIMMING", 0, 1500], ["TRANSITION", 1500, 120], ["CYCLING", 1620, 3900]]);
    expect(segmentsFromProviderLegs(legs).map((segment) => segment.kind)).toEqual(["SWIM", "T1", "BIKE"]);
  });
});

describe("sem dupla contagem (AC13)", () => {
  it("arquivo multiesporte + três cópias por esporte: a semana conta uma vez", () => {
    const parent = { id: "tri", durationSeconds: 8220, duplicateOfActivityId: null, parentActivityId: null };
    const copies = [
      { id: "swim", durationSeconds: 1500, duplicateOfActivityId: null, parentActivityId: "tri" },
      { id: "bike", durationSeconds: 3900, duplicateOfActivityId: null, parentActivityId: "tri" },
      { id: "run", durationSeconds: 2700, duplicateOfActivityId: null, parentActivityId: "tri" },
    ];
    const mirror = { id: "tri-strava", durationSeconds: 8220, duplicateOfActivityId: "tri", parentActivityId: null };
    const easy = { id: "easy", durationSeconds: 1800, duplicateOfActivityId: null, parentActivityId: null };
    expect(weeklySecondsCountedOnce([parent, ...copies, mirror, easy])).toBe(8220 + 1800);
  });

  it("selecionar dois trechos do mesmo arquivo para duas prescrições não repete segundos", () => {
    const first = validateSelections(3600, [], [{ startOffsetSeconds: 0, endOffsetSeconds: 1800, kind: "OTHER", label: null }]);
    expect(first).toMatchObject({ ok: true, coveredSeconds: 1800 });
    const second = validateSelections(3600, [{ startOffsetSeconds: 0, endOffsetSeconds: 1800 }], [{ startOffsetSeconds: 1800, endOffsetSeconds: 3600, kind: "OTHER", label: null }]);
    expect(second).toMatchObject({ ok: true, coveredSeconds: 1800 });
    const overlap = validateSelections(3600, [{ startOffsetSeconds: 0, endOffsetSeconds: 1800 }], [{ startOffsetSeconds: 1700, endOffsetSeconds: 3600, kind: "OTHER", label: null }]);
    expect(overlap).toMatchObject({ ok: false, reason: expect.stringContaining("não podem contar duas vezes") });
    expect(validateSelections(3600, [], [{ startOffsetSeconds: 0, endOffsetSeconds: 4000, kind: "OTHER", label: null }]).ok).toBe(false);
  });
});

describe("brick (§16.3)", () => {
  it("bike, intervalo real e corrida: 12 min é transição; 3 h é sessão separada; total decorrido com legenda", () => {
    const start = new Date("2026-10-10T07:00:00Z");
    const result = brickComparison([
      { order: 1, title: "Bike", sportType: "bike", startedAt: start, durationSeconds: 2700, executed: true },
      { order: 2, title: "Corrida", sportType: "run", startedAt: new Date(start.getTime() + (2700 + 720) * 1000), durationSeconds: 900, executed: true },
    ]);
    expect(result.rows[1]).toMatchObject({ intervalSeconds: 720, intervalLabel: "transição" });
    expect(result.elapsedSeconds).toBe(2700 + 720 + 900);
    expect(result.elapsedLegend).toContain("incluindo os intervalos");
    const later = brickComparison([
      { order: 1, title: "Bike", sportType: "bike", startedAt: start, durationSeconds: 2700, executed: true },
      { order: 2, title: "Corrida", sportType: "run", startedAt: new Date(start.getTime() + (2700 + 3 * 3600) * 1000), durationSeconds: 900, executed: true },
    ]);
    expect(later.rows[1]!.intervalLabel).toBe("sessão separada (horas depois)");
  });
});

describe("nada é fundido automaticamente (ADR-003)", () => {
  it("o espelho é só marcado, nunca apagado nem fundido; falha de leitura não lança", async () => {
    const updateMany = async () => ({ count: 1 });
    const db = { activity: { findMany: async () => [{ id: "other", provider: "STRAVA", sportType: "run", startedAt: new Date("2026-10-10T07:00:00Z"), durationSeconds: 1800, distanceMeters: 5000, duplicateOfActivityId: null }], updateMany, delete: () => { throw new Error("never"); }, deleteMany: () => { throw new Error("never"); } } };
    const result = await markDuplicateSession(db as never, { id: "mine", userId: "u", wearableConnectionId: "c", provider: "GARMIN", sportType: "run", startedAt: new Date("2026-10-10T07:00:30Z"), durationSeconds: 1800, distanceMeters: 5000, duplicateOfActivityId: null });
    expect(["marked", "unchanged", "failed"]).toContain(result.status);
  });
});
