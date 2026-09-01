import { describe, expect, it } from "vitest";

import {
  RYVANO_SPORT_TYPES,
  type RyvanoSportType,
} from "@/modules/shared/activities/sport-types";
import {
  METRIC_DISPLAY_RULES,
  type MetricDisplayCategory,
  getMetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";

/**
 * Teste tabular exaustivo do Apêndice A (Tarefa 1.6).
 *
 * A tabela de expectativas abaixo é uma transcrição **independente** do
 * Apêndice A do `requirements.md` desta spec (mapeamento `sport_type` do Strava
 * -> `RyvanoSportType` -> categoria de exibição de métricas). Ela nunca importa
 * `RYVANO_SPORT_TO_METRIC_CATEGORY`: o teste compara a saída de
 * `getMetricDisplayCategory` contra a expectativa escrita à mão, e não a
 * implementação contra si mesma.
 *
 * `open-water`, `futsal`, `triathlon`, `duathlon`, `aquathlon` e `default` não
 * aparecem no Apêndice A (não existem como `sport_type` do Strava) e por isso
 * são cobertos por uma segunda tabela, derivada diretamente do Requisito 12.2.
 *
 * _Requisitos: 12.2, 12.4, 12.5_
 */

/**
 * Rótulos pt-BR das categorias do Requisito 12.2 (como aparecem na coluna
 * "Categoria de exibição de métricas" do Apêndice A) -> identificador interno.
 */
const CATEGORY_BY_APPENDIX_LABEL = {
  "Resistência com ritmo": "endurance-pace",
  Ciclismo: "cycling",
  "Natação/desempenho aquático": "swim",
  "Remo e prancha": "paddle",
  "Vento e vela": "wind-sail",
  "Força e estúdio": "strength-studio",
  "Esportes coletivos e de raquete": "team-racket",
  "Neve, gelo e aventura": "snow-ice-adventure",
  Multiesporte: "multisport",
  "Padrão/desconhecido": "default",
} as const satisfies Record<string, MetricDisplayCategory>;

type AppendixCategoryLabel = keyof typeof CATEGORY_BY_APPENDIX_LABEL;

/** Uma linha do Apêndice A: `sport_type` do Strava, canônico e categoria. */
type AppendixRow = readonly [
  stravaSportType: string,
  ryvanoSportType: RyvanoSportType,
  categoryLabel: AppendixCategoryLabel,
];

/**
 * Apêndice A do `requirements.md`, linha por linha, na mesma ordem do
 * documento. Cobre todos os `sport_type` conhecidos da enumeração oficial do
 * Strava mapeados nesta spec.
 */
const APPENDIX_A_ROWS: readonly AppendixRow[] = [
  ["Run", "run", "Resistência com ritmo"],
  ["TrailRun", "trail-run", "Resistência com ritmo"],
  ["Walk", "walking", "Resistência com ritmo"],
  ["Hike", "hiking", "Resistência com ritmo"],
  ["Wheelchair", "wheelchair", "Resistência com ritmo"],
  ["VirtualRun", "run", "Resistência com ritmo"],
  ["Ride", "bike", "Ciclismo"],
  ["MountainBikeRide", "mtb", "Ciclismo"],
  ["GravelRide", "bike", "Ciclismo"],
  ["EBikeRide", "bike", "Ciclismo"],
  ["EMountainBikeRide", "mtb", "Ciclismo"],
  ["Handcycle", "handcycle", "Ciclismo"],
  ["Velomobile", "bike", "Ciclismo"],
  ["VirtualRide", "bike", "Ciclismo"],
  ["Swim", "swim", "Natação/desempenho aquático"],
  ["Canoeing", "kayak", "Remo e prancha"],
  ["Kayaking", "kayak", "Remo e prancha"],
  ["Kitesurf", "kitesurf", "Vento e vela"],
  ["Rowing", "rowing", "Remo e prancha"],
  ["Sail", "sail", "Vento e vela"],
  ["StandUpPaddling", "stand-up-paddle", "Remo e prancha"],
  ["Surfing", "surf", "Vento e vela"],
  ["Windsurf", "windsurf", "Vento e vela"],
  ["VirtualRow", "rowing", "Remo e prancha"],
  ["WeightTraining", "gym", "Força e estúdio"],
  ["Workout", "gym", "Força e estúdio"],
  ["Crossfit", "crossfit", "Força e estúdio"],
  ["HighIntensityIntervalTraining", "gym", "Força e estúdio"],
  ["Elliptical", "gym", "Força e estúdio"],
  ["StairStepper", "gym", "Força e estúdio"],
  ["Yoga", "gym", "Força e estúdio"],
  ["Pilates", "gym", "Força e estúdio"],
  ["PhysicalTherapy", "gym", "Força e estúdio"],
  ["Dance", "dance", "Força e estúdio"],
  ["Soccer", "football", "Esportes coletivos e de raquete"],
  ["Basketball", "basketball", "Esportes coletivos e de raquete"],
  ["Volleyball", "volleyball", "Esportes coletivos e de raquete"],
  ["Tennis", "tennis", "Esportes coletivos e de raquete"],
  ["Padel", "padel", "Esportes coletivos e de raquete"],
  ["Pickleball", "pickleball", "Esportes coletivos e de raquete"],
  ["Badminton", "badminton", "Esportes coletivos e de raquete"],
  ["Squash", "squash", "Esportes coletivos e de raquete"],
  ["TableTennis", "table-tennis", "Esportes coletivos e de raquete"],
  ["Racquetball", "racquetball", "Esportes coletivos e de raquete"],
  ["Golf", "golf", "Esportes coletivos e de raquete"],
  ["Cricket", "cricket", "Esportes coletivos e de raquete"],
  ["AlpineSki", "alpine-ski", "Neve, gelo e aventura"],
  ["BackcountrySki", "backcountry-ski", "Neve, gelo e aventura"],
  ["NordicSki", "nordic-ski", "Neve, gelo e aventura"],
  ["Snowboard", "snowboard", "Neve, gelo e aventura"],
  ["Snowshoe", "snowshoe", "Neve, gelo e aventura"],
  ["IceSkate", "ice-skate", "Neve, gelo e aventura"],
  ["InlineSkate", "inline-skate", "Neve, gelo e aventura"],
  ["RollerSki", "roller-ski", "Neve, gelo e aventura"],
  ["Skateboard", "skateboard", "Neve, gelo e aventura"],
  ["RockClimbing", "rock-climbing", "Neve, gelo e aventura"],
];

/**
 * Modalidades canônicas que não existem como `sport_type` do Strava e por isso
 * não constam do Apêndice A. A categoria vem do Requisito 12.2:
 * `open-water` é citada em "Natação/desempenho aquático", `futsal` em
 * "Esportes coletivos e de raquete", os multiesportes em "Multiesporte" e
 * `default` na categoria "Padrão/desconhecido".
 */
const NON_STRAVA_ROWS: readonly (readonly [
  ryvanoSportType: RyvanoSportType,
  categoryLabel: AppendixCategoryLabel,
])[] = [
  ["open-water", "Natação/desempenho aquático"],
  ["futsal", "Esportes coletivos e de raquete"],
  ["triathlon", "Multiesporte"],
  ["duathlon", "Multiesporte"],
  ["aquathlon", "Multiesporte"],
  ["default", "Padrão/desconhecido"],
];

/** Tabela de expectativas consolidada, indexada pelo tipo canônico. */
const EXPECTED_CATEGORY_BY_SPORT = new Map<
  RyvanoSportType,
  MetricDisplayCategory
>([
  ...APPENDIX_A_ROWS.map(
    ([, sport, label]) =>
      [sport, CATEGORY_BY_APPENDIX_LABEL[label]] as const satisfies readonly [
        RyvanoSportType,
        MetricDisplayCategory,
      ],
  ),
  ...NON_STRAVA_ROWS.map(
    ([sport, label]) =>
      [sport, CATEGORY_BY_APPENDIX_LABEL[label]] as const satisfies readonly [
        RyvanoSportType,
        MetricDisplayCategory,
      ],
  ),
]);

describe("Apêndice A — mapeamento sport_type -> RyvanoSportType -> categoria", () => {
  it.each(APPENDIX_A_ROWS)(
    "%s -> %s -> %s",
    (_stravaSportType, ryvanoSportType, categoryLabel) => {
      expect(getMetricDisplayCategory(ryvanoSportType)).toBe(
        CATEGORY_BY_APPENDIX_LABEL[categoryLabel],
      );
    },
  );

  it("é internamente consistente: o mesmo canônico nunca aparece com duas categorias", () => {
    const seen = new Map<RyvanoSportType, MetricDisplayCategory>();

    for (const [stravaSportType, sport, label] of APPENDIX_A_ROWS) {
      const category = CATEGORY_BY_APPENDIX_LABEL[label];
      const previous = seen.get(sport);

      if (previous !== undefined) {
        expect(
          previous,
          `${stravaSportType} atribui "${category}" a "${sport}", que já era "${previous}"`,
        ).toBe(category);
      }

      seen.set(sport, category);
    }
  });
});

describe("categorias das modalidades fora do Apêndice A (Requisito 12.2)", () => {
  it.each(NON_STRAVA_ROWS)("%s -> %s", (ryvanoSportType, categoryLabel) => {
    expect(getMetricDisplayCategory(ryvanoSportType)).toBe(
      CATEGORY_BY_APPENDIX_LABEL[categoryLabel],
    );
  });
});

describe("cobertura exaustiva da taxonomia canônica (Requisitos 12.4, 12.5)", () => {
  it("atribui uma categoria a todo RyvanoSportType, sem lacunas", () => {
    const missing = RYVANO_SPORT_TYPES.filter(
      (sport) => !EXPECTED_CATEGORY_BY_SPORT.has(sport),
    );

    expect(missing).toEqual([]);
  });

  it("não espera categoria para nenhum valor fora de RYVANO_SPORT_TYPES", () => {
    const canonical = new Set<RyvanoSportType>(RYVANO_SPORT_TYPES);
    const unknown = [...EXPECTED_CATEGORY_BY_SPORT.keys()].filter(
      (sport) => !canonical.has(sport),
    );

    expect(unknown).toEqual([]);
  });

  it("resolve a categoria esperada para todo RyvanoSportType", () => {
    for (const sport of RYVANO_SPORT_TYPES) {
      expect(getMetricDisplayCategory(sport)).toBe(
        EXPECTED_CATEGORY_BY_SPORT.get(sport),
      );
    }
  });

  it("resolve uma categoria com regras de exibição declaradas", () => {
    for (const sport of RYVANO_SPORT_TYPES) {
      const category = getMetricDisplayCategory(sport);

      expect(METRIC_DISPLAY_RULES[category]).toBeDefined();
    }
  });
});

describe("regras de exibição das categorias sem ritmo/cadência (Requisito 12.2)", () => {
  /**
   * Categorias em que o Requisito 12.2 é explícito: "SEM cadência e SEM
   * ritmo/pace" (vento e vela), "SEM ritmo/pace, SEM cadência baseada em
   * distância, SEM frequência de braçadas" (força e estúdio) e "SEM
   * ritmo/pace, SEM cadência/frequência de braçadas" (coletivos e raquete).
   */
  const CATEGORIES_WITHOUT_PACE_OR_CADENCE: readonly MetricDisplayCategory[] = [
    "wind-sail",
    "strength-studio",
    "team-racket",
    "snow-ice-adventure",
    "default",
  ];

  it.each(CATEGORIES_WITHOUT_PACE_OR_CADENCE)(
    "%s não exibe ritmo/pace nem cadência/frequência de braçadas",
    (category) => {
      expect(METRIC_DISPLAY_RULES[category].pace).toBe(false);
      expect(METRIC_DISPLAY_RULES[category].cadenceOrStrokeRate).toBe(false);
    },
  );

  it("usa ritmo por 100m na natação e ritmo por km na resistência com ritmo", () => {
    expect(METRIC_DISPLAY_RULES.swim.pace).toBe("pace-per-100m");
    expect(METRIC_DISPLAY_RULES.swim.cadenceOrStrokeRate).toBe("stroke-rate");
    expect(METRIC_DISPLAY_RULES["endurance-pace"].pace).toBe("pace-per-km");
    expect(METRIC_DISPLAY_RULES["endurance-pace"].cadenceOrStrokeRate).toBe(
      "cadence",
    );
  });

  it("usa velocidade (não ritmo) com cadência no ciclismo", () => {
    expect(METRIC_DISPLAY_RULES.cycling.pace).toBe(false);
    expect(METRIC_DISPLAY_RULES.cycling.speedFallback).toBe(true);
    expect(METRIC_DISPLAY_RULES.cycling.cadenceOrStrokeRate).toBe("cadence");
  });
});
