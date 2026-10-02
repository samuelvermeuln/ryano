/**
 * SAM-32 — `averagePace` derivado para o Strava.
 *
 * O Strava reporta só `average_speed` (m/s). A coluna `averagePace` segue a
 * convenção por modalidade já usada pelo Garmin: segundos por 100 m para
 * natação, segundos por km para as modalidades com ritmo, `null` para as que
 * não exibem ritmo. Sem isso o resumo e o herói do detalhe ficavam "—".
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { NormalizedActivity } from "@/modules/shared/activities/contracts";
import {
  METRIC_DISPLAY_RULES,
  getMetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";
import {
  deriveStravaAveragePace,
  normalizedStravaActivityToActivityData,
} from "@/modules/strava/database/mappers/normalized-activity-to-activity";

function normalized(overrides: Partial<NormalizedActivity>): NormalizedActivity {
  return {
    source: "STRAVA",
    externalId: "1",
    sportType: "run",
    providerSportType: "Run",
    startedAt: new Date("2026-10-02T07:40:00.000Z"),
    ...overrides,
  };
}

describe("deriveStravaAveragePace (SAM-32)", () => {
  it("natação: segundos por 100 m", () => {
    expect(deriveStravaAveragePace("swim", 1)).toBeCloseTo(100);
    expect(deriveStravaAveragePace("open-water", 0.5)).toBeCloseTo(200);
  });

  it("corrida/caminhada: segundos por km", () => {
    expect(deriveStravaAveragePace("run", 3.7)).toBeCloseTo(1000 / 3.7);
    expect(deriveStravaAveragePace("walking", 1.5)).toBeCloseTo(1000 / 1.5);
  });

  it("modalidades sem ritmo ficam sem pace", () => {
    expect(deriveStravaAveragePace("bike", 8)).toBeNull();
    expect(deriveStravaAveragePace("gym", 1)).toBeNull();
    expect(deriveStravaAveragePace("football", 2)).toBeNull();
  });

  it("velocidade ausente, zero ou inválida nunca vira pace", () => {
    expect(deriveStravaAveragePace("run", undefined)).toBeNull();
    expect(deriveStravaAveragePace("run", 0)).toBeNull();
    expect(deriveStravaAveragePace("run", Number.NaN)).toBeNull();
    expect(deriveStravaAveragePace("swim", -1)).toBeNull();
  });

  it("propriedade: o pace existe exatamente quando a categoria da modalidade exibe ritmo", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RYVANO_SPORT_TYPES),
        fc.double({ min: 0.1, max: 30, noNaN: true }),
        (sportType, speed) => {
          const pace = deriveStravaAveragePace(sportType, speed);
          const rule = METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)].pace;

          if (rule === false) {
            expect(pace).toBeNull();
            return;
          }

          expect(pace).not.toBeNull();
          expect(pace!).toBeGreaterThan(0);
          expect(pace!).toBeCloseTo((rule === "pace-per-100m" ? 100 : 1000) / speed, 6);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("normalizedStravaActivityToActivityData (SAM-32)", () => {
  it("grava averagePace junto com averageSpeed", () => {
    const data = normalizedStravaActivityToActivityData(
      normalized({ sportType: "run", averageSpeed: 4 }),
    );

    expect(data.averageSpeed).toBe(4);
    expect(data.averagePace).toBeCloseTo(250);
  });

  it("ciclismo mantém só a velocidade", () => {
    const data = normalizedStravaActivityToActivityData(
      normalized({ sportType: "bike", providerSportType: "Ride", averageSpeed: 8 }),
    );

    expect(data.averageSpeed).toBe(8);
    expect(data.averagePace).toBeNull();
  });
});
