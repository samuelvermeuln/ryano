/**
 * Mapeador de sport type do Garmin para a taxonomia canônica da Ryvano.
 *
 * O Garmin identifica o tipo de atividade por strings cruas (ex.: `running`,
 * `lap_swimming`, `mountain_biking`, `strength_training`) provenientes de
 * `activityType.typeKey`, `sportType`, `eventType`, etc. Este parser converte
 * esse valor bruto para um `RyvanoSportType` canônico.
 *
 * O valor original do provider **não** é descartado: quem produz a
 * `NormalizedActivity` preserva-o em `providerSportType`, permitindo corrigir
 * mapeamentos no futuro sem perda do dado de origem (Requisito 7.5).
 *
 * A estratégia combina correspondência exata de `typeKey` conhecidos do Garmin
 * com um fallback por palavra-chave (substring), tolerante a rótulos livres e a
 * valores em português — na mesma linha do resolver de tom hoje usado na lista
 * de atividades (`resolveSportTone`), agora consolidado na taxonomia canônica.
 *
 * _Requisitos: 5.1, 5.2, 7.3, 7.4, 7.5_
 */

import type { RyvanoSportType } from "@/modules/shared/activities/sport-types";

/**
 * Normaliza o valor bruto: minúsculas, sem diacríticos, separadores unificados
 * em espaço. Ex.: `"Trail_Running"` → `"trail running"`,
 * `"Natação em Piscina"` → `"natacao em piscina"`.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mapa de `typeKey` exatos conhecidos do Garmin (após normalização) para o
 * esporte canônico. A correspondência exata tem prioridade sobre o fallback por
 * palavra-chave.
 */
const EXACT_TYPE_KEYS: Record<string, RyvanoSportType> = {
  // Corrida
  running: "run",
  street_running: "run",
  treadmill_running: "run",
  track_running: "run",
  indoor_running: "run",
  virtual_run: "run",
  trail_running: "trail-run",
  ultra_run: "trail-run",
  obstacle_run: "run",
  // Ciclismo
  cycling: "bike",
  road_biking: "bike",
  indoor_cycling: "bike",
  virtual_ride: "bike",
  gravel_cycling: "bike",
  cyclocross: "bike",
  track_cycling: "bike",
  bmx: "bike",
  e_bike_fitness: "bike",
  e_bike_mountain: "mtb",
  mountain_biking: "mtb",
  downhill_biking: "mtb",
  // Natação
  swimming: "swim",
  lap_swimming: "swim",
  pool_swimming: "swim",
  open_water_swimming: "open-water",
  open_water: "open-water",
  // Caminhada / trilha
  walking: "walking",
  casual_walking: "walking",
  speed_walking: "walking",
  hiking: "hiking",
  mountaineering: "hiking",
  // Força / ginásio
  strength_training: "gym",
  indoor_cardio: "gym",
  cardio: "gym",
  hiit: "gym",
  fitness_equipment: "gym",
  yoga: "gym",
  pilates: "gym",
  crossfit: "crossfit",
  // Multiesporte
  multi_sport: "triathlon",
  triathlon: "triathlon",
  duathlon: "duathlon",
  aquathlon: "aquathlon",
  // Remo / água
  rowing: "rowing",
  indoor_rowing: "rowing",
  kayaking: "kayak",
  stand_up_paddleboarding: "stand-up-paddle",
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
  { sport: "triathlon", keywords: ["triathlon", "triatlo", "multisport", "multi sport"] },
  { sport: "duathlon", keywords: ["duathlon", "duatlo"] },
  { sport: "aquathlon", keywords: ["aquathlon", "aquatlo"] },
  { sport: "swim", keywords: ["swim", "natac", "pool", "piscina"] },
  { sport: "bike", keywords: ["bike", "cycl", "cicl", "ride", "pedal"] },
  { sport: "run", keywords: ["run", "corr", "treadmill", "esteira"] },
  { sport: "hiking", keywords: ["hiking", "hike", "trilha", "mountaineer"] },
  { sport: "walking", keywords: ["walk", "caminh"] },
  { sport: "crossfit", keywords: ["crossfit"] },
  { sport: "gym", keywords: ["strength", "muscul", "forca", "cardio", "hiit", "fitness", "yoga", "pilates", "gym"] },
  { sport: "rowing", keywords: ["row", "remo"] },
  { sport: "kayak", keywords: ["kayak", "caiaque", "canoe"] },
  { sport: "stand-up-paddle", keywords: ["stand up paddle", "paddleboard", "sup"] },
  { sport: "surf", keywords: ["surf"] },
  { sport: "futsal", keywords: ["futsal"] },
  { sport: "football", keywords: ["soccer", "football", "futebol"] },
  { sport: "basketball", keywords: ["basket", "basquete"] },
  { sport: "volleyball", keywords: ["volley", "volei"] },
  { sport: "padel", keywords: ["padel"] },
  { sport: "tennis", keywords: ["tennis", "tenis"] },
];

/**
 * Converte o sport type bruto do Garmin em um `RyvanoSportType` canônico.
 *
 * Primeiro tenta uma correspondência exata de `typeKey` conhecido; em seguida,
 * aplica as regras de palavra-chave (mais específicas antes das genéricas).
 * Quando nada corresponde, retorna `"default"`.
 *
 * _Requisitos: 7.3, 7.4, 7.5_
 */
export function parseGarminSportType(providerValue: string): RyvanoSportType {
  if (!providerValue || !providerValue.trim()) {
    return "default";
  }

  const normalized = normalize(providerValue);

  const exact = EXACT_TYPE_KEYS[normalized.replace(/ /g, "_")];
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
