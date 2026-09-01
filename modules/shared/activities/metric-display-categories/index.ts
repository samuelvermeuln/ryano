/**
 * Categorias de exibição de métricas por modalidade.
 *
 * Resolve, a partir da modalidade canônica (`RyvanoSportType`) e **nunca** a
 * partir do identificador do provider de origem, quais seções/métricas fazem
 * sentido para uma atividade: zonas de FC, cadência/frequência de braçadas,
 * ritmo/pace (e em qual formato), fallback de velocidade e o tipo de conteúdo
 * da análise do treino.
 *
 * Módulo puro: sem I/O, sem acesso a banco (`@prisma/client`) e sem import de
 * qualquer módulo de provider. A tabela `RYVANO_SPORT_TO_METRIC_CATEGORY` é a
 * transcrição do Apêndice A do requirements.md desta spec.
 *
 * _Requisitos: 12.1, 12.2, 12.3, 12.5_
 */

import type { RyvanoSportType } from "@/modules/shared/activities/sport-types";

/**
 * Categorias de exibição de métricas reconhecidas pelo sistema (Requisito
 * 12.2). `"default"` é o fallback seguro para qualquer modalidade que não se
 * encaixe em nenhuma categoria conhecida (Requisito 12.3).
 */
export type MetricDisplayCategory =
  | "endurance-pace" // Resistência com ritmo
  | "cycling" // Ciclismo
  | "swim" // Natação/desempenho aquático
  | "paddle" // Remo e prancha
  | "wind-sail" // Vento e vela
  | "strength-studio" // Força e estúdio
  | "team-racket" // Esportes coletivos e de raquete
  | "snow-ice-adventure" // Neve, gelo e aventura
  | "multisport" // Multiesporte (tratamento pré-existente)
  | "default"; // Padrão/desconhecido

/** Regras de exibição de métricas de uma categoria. */
export interface MetricDisplayRules {
  heartRateZones: boolean;
  /** `false` quando a categoria não usa nenhum dos dois. */
  cadenceOrStrokeRate: "cadence" | "stroke-rate" | false;
  pace: "pace-per-km" | "pace-per-100m" | false;
  /** Exibir velocidade/distância quando pace não se aplica (ex.: ciclismo). */
  speedFallback: boolean;
  workoutAnalysis: "full" | "limited" | "effort-only" | false;
}

/** Regras por categoria de exibição de métricas (Requisito 12.2). */
export const METRIC_DISPLAY_RULES: Record<
  MetricDisplayCategory,
  MetricDisplayRules
> = {
  "endurance-pace": {
    heartRateZones: true,
    cadenceOrStrokeRate: "cadence",
    pace: "pace-per-km",
    speedFallback: false,
    workoutAnalysis: "full",
  },
  cycling: {
    heartRateZones: true,
    cadenceOrStrokeRate: "cadence",
    pace: false,
    speedFallback: true,
    workoutAnalysis: "full",
  },
  swim: {
    heartRateZones: true,
    cadenceOrStrokeRate: "stroke-rate",
    pace: "pace-per-100m",
    speedFallback: false,
    workoutAnalysis: "full",
  },
  paddle: {
    heartRateZones: true,
    cadenceOrStrokeRate: "stroke-rate",
    pace: false,
    speedFallback: true,
    workoutAnalysis: "limited",
  },
  "wind-sail": {
    heartRateZones: true,
    cadenceOrStrokeRate: false,
    pace: false,
    speedFallback: true,
    workoutAnalysis: "limited",
  },
  "strength-studio": {
    heartRateZones: true,
    cadenceOrStrokeRate: false,
    pace: false,
    speedFallback: false,
    workoutAnalysis: "effort-only",
  },
  "team-racket": {
    heartRateZones: true,
    cadenceOrStrokeRate: false,
    pace: false,
    speedFallback: false,
    workoutAnalysis: "effort-only",
  },
  "snow-ice-adventure": {
    heartRateZones: true,
    cadenceOrStrokeRate: false,
    pace: false,
    speedFallback: true,
    workoutAnalysis: "limited",
  },
  multisport: {
    heartRateZones: true,
    cadenceOrStrokeRate: "cadence",
    pace: "pace-per-km",
    speedFallback: true,
    workoutAnalysis: "full",
  },
  default: {
    heartRateZones: true,
    cadenceOrStrokeRate: false,
    pace: false,
    speedFallback: false,
    workoutAnalysis: "effort-only",
  },
};

/**
 * Mapa `RyvanoSportType` -> categoria de exibição de métricas (tabela completa
 * do Apêndice A do requirements.md).
 *
 * O `Record` exaustivo garante, em tempo de compilação, que todo valor
 * canônico tem uma categoria atribuída — se a taxonomia ganhar um valor novo
 * sem entrada aqui, o TypeScript acusa o erro.
 *
 * _Requisitos: 12.2, 12.5_
 */
export const RYVANO_SPORT_TO_METRIC_CATEGORY: Record<
  RyvanoSportType,
  MetricDisplayCategory
> = {
  default: "default",
  // Resistência com ritmo
  run: "endurance-pace",
  "trail-run": "endurance-pace",
  walking: "endurance-pace",
  hiking: "endurance-pace",
  wheelchair: "endurance-pace",
  // Ciclismo
  bike: "cycling",
  mtb: "cycling",
  handcycle: "cycling",
  // Natação/desempenho aquático
  swim: "swim",
  "open-water": "swim",
  // Remo e prancha
  rowing: "paddle",
  kayak: "paddle",
  "stand-up-paddle": "paddle",
  // Vento e vela
  surf: "wind-sail",
  kitesurf: "wind-sail",
  sail: "wind-sail",
  windsurf: "wind-sail",
  // Força e estúdio
  gym: "strength-studio",
  crossfit: "strength-studio",
  dance: "strength-studio",
  // Esportes coletivos e de raquete
  football: "team-racket",
  futsal: "team-racket",
  basketball: "team-racket",
  volleyball: "team-racket",
  tennis: "team-racket",
  padel: "team-racket",
  pickleball: "team-racket",
  badminton: "team-racket",
  squash: "team-racket",
  "table-tennis": "team-racket",
  racquetball: "team-racket",
  golf: "team-racket",
  cricket: "team-racket",
  // Neve, gelo e aventura
  "alpine-ski": "snow-ice-adventure",
  "backcountry-ski": "snow-ice-adventure",
  "nordic-ski": "snow-ice-adventure",
  snowboard: "snow-ice-adventure",
  snowshoe: "snow-ice-adventure",
  "ice-skate": "snow-ice-adventure",
  "inline-skate": "snow-ice-adventure",
  "roller-ski": "snow-ice-adventure",
  skateboard: "snow-ice-adventure",
  "rock-climbing": "snow-ice-adventure",
  // Multiesporte
  triathlon: "multisport",
  duathlon: "multisport",
  aquathlon: "multisport",
};

/**
 * Resolve a categoria de exibição de métricas de uma modalidade canônica.
 *
 * Função pura e determinística: depende exclusivamente do `sportType`, nunca
 * do provider de origem. Nunca lança — qualquer valor sem entrada na tabela
 * (inclusive um valor inesperado em runtime) cai em `"default"`.
 *
 * _Requisitos: 12.1, 12.3_
 */
export function getMetricDisplayCategory(
  sportType: RyvanoSportType,
): MetricDisplayCategory {
  return RYVANO_SPORT_TO_METRIC_CATEGORY[sportType] ?? "default";
}
