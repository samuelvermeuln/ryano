import { describe, expect, it } from "vitest";

import { parseStravaSportType } from "@/modules/strava/parsers/parse-strava-sport-type";
import {
  type RyvanoSportType,
  isRyvanoSportType,
} from "@/modules/shared/activities/sport-types";

/**
 * Testes tabulares de exemplo do mapeamento `sport_type` (Strava) →
 * `RyvanoSportType` (Tarefa 3.3).
 *
 * Exercita o parser pela API pública, com os valores em PascalCase exatamente
 * como o Strava os publica em `sport_type`
 * ([Strava API Reference](https://developers.strava.com/docs/reference/) —
 * modelo `SportType`; conteúdo parafraseado para conformidade com as restrições
 * de licenciamento). A tabela abaixo é a transcrição do Apêndice A do
 * `requirements.md` desta spec.
 *
 * Observação: `futsal` existe em `EXACT_SPORT_TYPES` como entrada defensiva,
 * mas não é um `sport_type` oficial do Strava — por isso não aparece nesta
 * tabela de valores oficiais.
 *
 * _Requisitos: 12.4, 12.6_
 */

/** Apêndice A: todos os `sport_type` oficiais do Strava e o esporte canônico. */
const APPENDIX_A: ReadonlyArray<readonly [string, RyvanoSportType]> = [
  // Resistência com ritmo
  ["Run", "run"],
  ["VirtualRun", "run"],
  ["TrailRun", "trail-run"],
  ["Walk", "walking"],
  ["Hike", "hiking"],
  ["Wheelchair", "wheelchair"],
  // Ciclismo
  ["Ride", "bike"],
  ["GravelRide", "bike"],
  ["VirtualRide", "bike"],
  ["MountainBikeRide", "mtb"],
  ["Handcycle", "handcycle"],
  // Natação
  ["Swim", "swim"],
  // Remo e prancha
  ["Rowing", "rowing"],
  ["VirtualRow", "rowing"],
  ["Canoeing", "kayak"],
  ["Kayaking", "kayak"],
  ["StandUpPaddling", "stand-up-paddle"],
  // Vento e vela
  ["Surfing", "surf"],
  ["Kitesurf", "kitesurf"],
  ["Windsurf", "windsurf"],
  ["Sail", "sail"],
  // Força e estúdio
  ["WeightTraining", "gym"],
  ["Workout", "gym"],
  ["HighIntensityIntervalTraining", "gym"],
  ["Elliptical", "gym"],
  ["StairStepper", "gym"],
  ["Yoga", "gym"],
  ["Pilates", "gym"],
  ["PhysicalTherapy", "gym"],
  ["Crossfit", "crossfit"],
  ["Dance", "dance"],
  // Esportes coletivos e de raquete
  ["Soccer", "football"],
  ["Basketball", "basketball"],
  ["Volleyball", "volleyball"],
  ["Tennis", "tennis"],
  ["Padel", "padel"],
  ["Pickleball", "pickleball"],
  ["Badminton", "badminton"],
  ["Squash", "squash"],
  ["TableTennis", "table-tennis"],
  ["Racquetball", "racquetball"],
  ["Golf", "golf"],
  ["Cricket", "cricket"],
  // Neve, gelo e aventura
  ["AlpineSki", "alpine-ski"],
  ["BackcountrySki", "backcountry-ski"],
  ["NordicSki", "nordic-ski"],
  ["Snowboard", "snowboard"],
  ["Snowshoe", "snowshoe"],
  ["IceSkate", "ice-skate"],
  ["InlineSkate", "inline-skate"],
  ["RollerSki", "roller-ski"],
  ["Skateboard", "skateboard"],
  ["RockClimbing", "rock-climbing"],
];

/**
 * Equivalências funcionais: `sport_type` oficiais que não têm valor canônico
 * dedicado e são mapeados para o esporte funcionalmente equivalente
 * (Requisito 12.6).
 */
const FUNCTIONAL_EQUIVALENCES: ReadonlyArray<readonly [string, RyvanoSportType]> = [
  ["Velomobile", "bike"],
  ["EBikeRide", "bike"],
  ["EMountainBikeRide", "mtb"],
];

describe("parseStravaSportType — Apêndice A (sport_type oficiais)", () => {
  it.each(APPENDIX_A)(
    'mapeia sport_type "%s" para "%s"',
    (providerValue, expected) => {
      expect(parseStravaSportType(providerValue)).toBe(expected);
    },
  );

  it("nunca devolve um valor fora da taxonomia canônica", () => {
    for (const [providerValue] of APPENDIX_A) {
      expect(isRyvanoSportType(parseStravaSportType(providerValue))).toBe(true);
    }
  });

  it("nunca cai no fallback default para um sport_type oficial", () => {
    const fallbacks = APPENDIX_A.filter(
      ([providerValue]) => parseStravaSportType(providerValue) === "default",
    ).map(([providerValue]) => providerValue);

    expect(fallbacks).toEqual([]);
  });
});

describe("parseStravaSportType — equivalências funcionais sem valor dedicado", () => {
  it.each(FUNCTIONAL_EQUIVALENCES)(
    'mapeia sport_type "%s" para o equivalente funcional "%s"',
    (providerValue, expected) => {
      expect(parseStravaSportType(providerValue)).toBe(expected);
    },
  );
});

describe("parseStravaSportType — precedência das regras de vento e vela", () => {
  /**
   * `Kitesurf` e `Windsurf` contêm a substring "surf", então a regra genérica
   * de `surf` só pode ser avaliada depois das específicas. Cobre tanto o
   * caminho de correspondência exata quanto o fallback por palavra-chave
   * (variantes que o Strava não publica, mas que exercitam a ordem das regras).
   */
  const WIND_AND_SAIL: ReadonlyArray<readonly [string, RyvanoSportType]> = [
    ["Kitesurf", "kitesurf"],
    ["KiteSurf", "kitesurf"],
    ["Kitesurfing", "kitesurf"],
    ["Kiteboarding", "kitesurf"],
    ["Windsurf", "windsurf"],
    ["WindSurf", "windsurf"],
    ["Windsurfing", "windsurf"],
    ["Sail", "sail"],
    ["Sailing", "sail"],
  ];

  it.each(WIND_AND_SAIL)('mapeia "%s" para "%s"', (providerValue, expected) => {
    expect(parseStravaSportType(providerValue)).toBe(expected);
  });

  it.each(WIND_AND_SAIL)(
    'não deixa "%s" cair na regra genérica de surf',
    (providerValue) => {
      expect(parseStravaSportType(providerValue)).not.toBe("surf");
    },
  );

  it("mantém a regra genérica de surf para o valor oficial Surfing", () => {
    expect(parseStravaSportType("Surfing")).toBe("surf");
    expect(parseStravaSportType("Surf")).toBe("surf");
  });
});
