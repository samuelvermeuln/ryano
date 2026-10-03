/**
 * SAM-73 — activity data quality (§14.6, §15.6, §18.3).
 */
import { describe, expect, it } from "vitest";

import {
  correctionInputSchema, detectGpsInconsistencies, effectiveValue, paceComparisonLabel, recomputePoolDistance, timeBreakdown,
} from "@/modules/shared/activities/domain/activity-correction";

describe("correção com original preservado (§18.3)", () => {
  it("1.950 m corrigidos para 2.000 m: o valor vigente é o corrigido, o original e o motivo continuam", () => {
    const rows = [{ field: "distanceMeters" as const, originalValue: 1950, correctedValue: 2000, reason: "a piscina tem 50 m, o relógio contou 25", authorName: "Maria", authorRole: "athlete" as const, createdAt: new Date("2026-10-03T10:00:00Z") }];
    expect(effectiveValue("distanceMeters", 1950, rows)).toMatchObject({ value: 2000, corrected: true, correction: { originalValue: 1950, reason: "a piscina tem 50 m, o relógio contou 25" } });
    expect(effectiveValue("movingSeconds", 1800, rows)).toEqual({ value: 1800, corrected: false, correction: null });
    expect(correctionInputSchema.safeParse({ field: "distanceMeters", correctedValue: 2000, reason: "ok" }).success).toBe(false);
  });

  it("piscina marcada como 25 m que era 25 jd: recálculo explícito pelo número de piscinas, com o método", () => {
    expect(recomputePoolDistance(2000, 25, 22.86)).toEqual({ lengths: 80, distanceMeters: 1828.8, method: "80 piscinas × 22.86 m" });
    expect(recomputePoolDistance(1000, 25, 50)).toEqual({ lengths: 40, distanceMeters: 2000, method: "40 piscinas × 50 m" });
  });
});

describe("tempos e rótulos (§14.6)", () => {
  it("decorrido, em movimento e pausas separados; ausente é nulo, nunca zero", () => {
    expect(timeBreakdown({ elapsedSeconds: 3600, timerSeconds: 3500, movingSeconds: 3300, durationSeconds: 3500 })).toEqual({ elapsed: 3600, moving: 3300, timer: 3500, pauses: 300 });
    expect(timeBreakdown({ elapsedSeconds: null, timerSeconds: null, movingSeconds: null, durationSeconds: 3500 })).toEqual({ elapsed: null, moving: null, timer: 3500, pauses: null });
  });

  it("ritmo: 'mais rápido em 0:15' / 'mais lento em 0:20' sem sinais ambíguos", () => {
    expect(paceComparisonLabel(285, 300)).toBe("mais rápido em 0:15");
    expect(paceComparisonLabel(320, 300)).toBe("mais lento em 0:20");
    expect(paceComparisonLabel(300, 300)).toBe("no mesmo ritmo");
  });
});

describe("GPS inconsistente só sinaliza (§18.3)", () => {
  it("salto de posição e velocidade impossível para corrida geram avisos; nada é alterado", () => {
    const findings = detectGpsInconsistencies({
      sportType: "run",
      time: [0, 10, 20, 30],
      distance: [0, 30, 60, 400],
      latlng: [[-23.55, -46.63], [-23.5503, -46.63], [-23.5506, -46.63], [-23.56, -46.63]],
    });
    expect(findings.map((finding) => finding.kind)).toEqual(["IMPOSSIBLE_SPEED"]);
    expect(findings[0]).toMatchObject({ atSecond: 30 });
    const jump = detectGpsInconsistencies({ sportType: "run", time: [0, 10], latlng: [[-23.55, -46.63], [-23.56, -46.63]] });
    expect(jump[0]).toMatchObject({ kind: "JUMP", atSecond: 10 });
    expect(detectGpsInconsistencies({ sportType: "ride", time: [0, 10], distance: [0, 150] })).toEqual([]);
  });
});
