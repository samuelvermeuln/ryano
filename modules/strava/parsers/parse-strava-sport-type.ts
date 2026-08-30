/**
 * Mapeador de sport type do Strava para a taxonomia canônica da Ryvano.
 *
 * O Strava identifica o tipo de atividade por dois campos:
 *   - `sport_type` — o campo canônico e atual (ex.: `Run`, `TrailRun`, `Ride`,
 *     `MountainBikeRide`, `GravelRide`, `VirtualRide`, `Swim`, `Walk`, `Hike`,
 *     `WeightTraining`, `Workout`, `Crossfit`, `Kayaking`, `Rowing`,
 *     `StandUpPaddling`, `Surfing`, `Soccer`, ...). É o valor PREFERIDO.
 *   - `type` — o campo legado (`ActivityType`), com um conjunto menor de valores
 *     (também em PascalCase, ex.: `Run`, `Ride`, `Swim`). Usado como fallback
 *     quando `sport_type` está ausente.
 *
 * Este parser converte esse valor bruto (`sport_type` de preferência, senão
 * `type`) para um `RyvanoSportType` canônico. O valor original do provider
 * **não** é descartado: quem produz a `NormalizedActivity`
 * (`parseStravaActivity`) preserva-o em `providerSportType`, permitindo corrigir
 * mapeamentos no futuro sem perda do dado de origem (Requisito 7.5).
 *
 * A estratégia espelha a do Garmin (`parse-garmin-sport-type.ts`): correspondência
 * exata de valores conhecidos do Strava com um fallback por palavra-chave
 * (substring), avaliando variantes mais específicas antes das genéricas. Quando
 * nada corresponde, retorna `"default"`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Valores confirmados na documentação oficial vigente do Strava
 * ([Strava API Reference](https://developers.strava.com/docs/reference/) —
 * `SportType`/`ActivityType`; a própria doc exemplifica `sport_type` com
 * "Run, MountainBikeRide, Ride, etc." e `type` com "Run, Ride etc.", e o payload
 * de amostra traz `"type":"Ride"` + `"sport_type":"MountainBikeRide"`). O
 * [changelog](https://developers.strava.com/docs/changelog/) registra a adição de
 * Basketball, Cricket, Dance, Padel, Physical Therapy e Volleyball aos sport
 * types. (Conteúdo parafraseado para conformidade com as restrições de
 * licenciamento.)
 *
 * Observação sobre natação: o `sport_type` do Strava usa apenas `Swim` (não há
 * um valor dedicado de águas abertas), então `Swim` mapeia para `swim`. O ramo
 * `open-water` permanece no fallback por palavra-chave apenas por robustez.
 *
 * _Requisitos: 11.4, 7.1, 7.4, 7.5_
 */

import type { RyvanoSportType } from "@/modules/shared/activities/sport-types";

/**
 * Normaliza o valor bruto do Strava. Como os valores vêm em PascalCase sem
 * separadores (ex.: `MountainBikeRide`), primeiro inserimos um espaço antes de
 * cada maiúscula/dígito para separar as palavras; depois minúsculas, remoção de
 * diacríticos e unificação de separadores em espaço.
 *
 * Ex.: `"MountainBikeRide"` → `"mountain bike ride"`,
 * `"EBikeRide"` → `"e bike ride"`, `"TrailRun"` → `"trail run"`.
 */
function normalize(value: string): string {
  return value
    // Separa transições camelCase/PascalCase e antes de dígitos.
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mapa de valores exatos conhecidos do Strava (após normalização, com espaços
 * trocados por `_`) para o esporte canônico. A correspondência exata tem
 * prioridade sobre o fallback por palavra-chave. Cobre tanto `sport_type`
 * (canônico) quanto os valores compartilhados de `type` (legado).
 */
const EXACT_SPORT_TYPES: Record<string, RyvanoSportType> = {
  // Corrida
  run: "run",
  virtual_run: "run",
  trail_run: "trail-run",
  // Ciclismo
  ride: "bike",
  gravel_ride: "bike",
  virtual_ride: "bike",
  e_bike_ride: "bike",
  velomobile: "bike",
  mountain_bike_ride: "mtb",
  e_mountain_bike_ride: "mtb",
  // Natação (Strava não distingue águas abertas em sport_type)
  swim: "swim",
  // Caminhada / trilha
  walk: "walking",
  hike: "hiking",
  // Força / ginásio / condicionamento
  weight_training: "gym",
  workout: "gym",
  high_intensity_interval_training: "gym",
  elliptical: "gym",
  stair_stepper: "gym",
  yoga: "gym",
  pilates: "gym",
  physical_therapy: "gym",
  crossfit: "crossfit",
  // Remo / água
  rowing: "rowing",
  virtual_row: "rowing",
  kayaking: "kayak",
  canoeing: "kayak",
  stand_up_paddling: "stand-up-paddle",
  surfing: "surf",
  // Esportes coletivos / raquete
  soccer: "football",
  football: "football",
  futsal: "futsal",
  basketball: "basketball",
  volleyball: "volleyball",
  tennis: "tennis",
  padel: "padel",
};

/**
 * Regras de fallback por palavra-chave, avaliadas em ordem: variantes mais
 * específicas (ex.: mountain bike, trail run, águas abertas) precisam vir antes
 * das genéricas (bike, run, swim).
 */
const KEYWORD_RULES: ReadonlyArray<{
  sport: RyvanoSportType;
  keywords: readonly string[];
}> = [
  { sport: "open-water", keywords: ["open water", "aguas abertas", "agua aberta"] },
  { sport: "mtb", keywords: ["mountain bik", "mtb", "downhill"] },
  { sport: "trail-run", keywords: ["trail", "ultra"] },
  { sport: "swim", keywords: ["swim", "natac", "piscina"] },
  { sport: "bike", keywords: ["bike", "ride", "cycl", "cicl", "pedal"] },
  { sport: "run", keywords: ["run", "corr"] },
  { sport: "hiking", keywords: ["hike", "hik", "trilha", "mountaineer"] },
  { sport: "walking", keywords: ["walk", "caminh"] },
  { sport: "crossfit", keywords: ["crossfit"] },
  { sport: "rowing", keywords: ["row", "remo"] },
  { sport: "kayak", keywords: ["kayak", "canoe", "caiaque"] },
  { sport: "stand-up-paddle", keywords: ["stand up paddle", "paddl", "sup"] },
  { sport: "surf", keywords: ["surf"] },
  { sport: "futsal", keywords: ["futsal"] },
  { sport: "football", keywords: ["soccer", "football", "futebol"] },
  { sport: "basketball", keywords: ["basket", "basquete"] },
  { sport: "volleyball", keywords: ["volley", "volei"] },
  { sport: "padel", keywords: ["padel"] },
  { sport: "tennis", keywords: ["tennis", "tenis"] },
  {
    sport: "gym",
    keywords: [
      "weight",
      "training",
      "gym",
      "fitness",
      "yoga",
      "pilates",
      "cardio",
      "hiit",
      "interval",
      "elliptical",
      "stair",
      "workout",
    ],
  },
];

/**
 * Converte o sport type bruto do Strava em um `RyvanoSportType` canônico.
 *
 * Recebe o valor já resolvido pelo chamador (preferir `sport_type` sobre `type`).
 * Primeiro tenta uma correspondência exata de valor conhecido; em seguida,
 * aplica as regras de palavra-chave (mais específicas antes das genéricas).
 * Quando nada corresponde (ou o valor é vazio), retorna `"default"`.
 *
 * _Requisitos: 11.4, 7.3, 7.4, 7.5_
 */
export function parseStravaSportType(providerValue: string): RyvanoSportType {
  if (!providerValue || !providerValue.trim()) {
    return "default";
  }

  const normalized = normalize(providerValue);

  const exact = EXACT_SPORT_TYPES[normalized.replace(/ /g, "_")];
  if (exact) {
    return exact;
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.sport;
    }
  }

  return "default";
}
