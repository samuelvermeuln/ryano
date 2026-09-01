/**
 * Taxonomia canônica de esportes da Ryvano.
 *
 * `RyvanoSportType` é a **fonte única** de taxonomia de esportes, consumida por
 * telas e relatórios. Ela substitui/consolida as taxonomias hoje duplicadas em
 * vários lugares (`lib/sports.ts`, `lib/reports/types.ts`, resolvers de tom em
 * `report-builder.ts` e na lista de atividades).
 *
 * Cada módulo de provider expõe seu próprio
 * `parse<Provider>SportType(providerValue): RyvanoSportType`, que converte o
 * tipo bruto do provider para esta taxonomia. O valor original do provider é
 * preservado separadamente (`providerSportType`), permitindo corrigir
 * mapeamentos no futuro sem perder o dado de origem.
 *
 * Durante a transição, os mapeadores abaixo (`mapRyvanoSportToLegacy` e
 * `mapRyvanoSportToReportTheme`) permitem conviver com as taxonomias legadas
 * sem reescrever todos os templates de uma vez.
 *
 * _Requisitos: 7.3, 7.4, 7.5_
 */

import type { SportIconName } from "@/lib/sports";
import type { ReportThemeSport } from "@/lib/reports/types";

/**
 * Taxonomia canônica de esportes. Todo dado de atividade normalizado usa um
 * destes valores em `sportType`, independentemente do provider de origem.
 */
export type RyvanoSportType =
  | "default"
  | "swim"
  | "open-water"
  | "bike"
  | "mtb"
  | "run"
  | "trail-run"
  | "triathlon"
  | "duathlon"
  | "aquathlon"
  | "walking"
  | "hiking"
  | "gym"
  | "crossfit"
  | "football"
  | "futsal"
  | "basketball"
  | "volleyball"
  | "tennis"
  | "padel"
  | "surf"
  | "rowing"
  | "kayak"
  | "stand-up-paddle"
  | "wheelchair"
  | "handcycle"
  | "kitesurf"
  | "sail"
  | "windsurf"
  | "pickleball"
  | "badminton"
  | "squash"
  | "table-tennis"
  | "racquetball"
  | "golf"
  | "cricket"
  | "dance"
  | "alpine-ski"
  | "backcountry-ski"
  | "nordic-ski"
  | "snowboard"
  | "snowshoe"
  | "ice-skate"
  | "inline-skate"
  | "roller-ski"
  | "skateboard"
  | "rock-climbing";

/** Lista de todos os valores canônicos, útil para iteração e validação. */
export const RYVANO_SPORT_TYPES: readonly RyvanoSportType[] = [
  "default",
  "swim",
  "open-water",
  "bike",
  "mtb",
  "run",
  "trail-run",
  "triathlon",
  "duathlon",
  "aquathlon",
  "walking",
  "hiking",
  "gym",
  "crossfit",
  "football",
  "futsal",
  "basketball",
  "volleyball",
  "tennis",
  "padel",
  "surf",
  "rowing",
  "kayak",
  "stand-up-paddle",
  "wheelchair",
  "handcycle",
  "kitesurf",
  "sail",
  "windsurf",
  "pickleball",
  "badminton",
  "squash",
  "table-tennis",
  "racquetball",
  "golf",
  "cricket",
  "dance",
  "alpine-ski",
  "backcountry-ski",
  "nordic-ski",
  "snowboard",
  "snowshoe",
  "ice-skate",
  "inline-skate",
  "roller-ski",
  "skateboard",
  "rock-climbing",
] as const;

/** Rótulos legíveis (pt-BR) para exibição em UI e relatórios. */
const RYVANO_SPORT_LABELS: Record<RyvanoSportType, string> = {
  default: "Atividade",
  swim: "Natação",
  "open-water": "Águas Abertas",
  bike: "Ciclismo",
  mtb: "Mountain Bike",
  run: "Corrida",
  "trail-run": "Trail Run",
  triathlon: "Triathlon",
  duathlon: "Duathlon",
  aquathlon: "Aquathlon",
  walking: "Caminhada",
  hiking: "Trilha",
  gym: "Musculação",
  crossfit: "CrossFit",
  football: "Futebol",
  futsal: "Futsal",
  basketball: "Basquete",
  volleyball: "Vôlei",
  tennis: "Tênis",
  padel: "Padel",
  surf: "Surf",
  rowing: "Remo",
  kayak: "Caiaque",
  "stand-up-paddle": "Stand Up Paddle",
  wheelchair: "Cadeira de Rodas",
  handcycle: "Handbike",
  kitesurf: "Kitesurf",
  sail: "Vela",
  windsurf: "Windsurf",
  pickleball: "Pickleball",
  badminton: "Badminton",
  squash: "Squash",
  "table-tennis": "Tênis de Mesa",
  racquetball: "Raquetebol",
  golf: "Golfe",
  cricket: "Críquete",
  dance: "Dança",
  "alpine-ski": "Esqui Alpino",
  "backcountry-ski": "Esqui Fora de Pista",
  "nordic-ski": "Esqui Nórdico",
  snowboard: "Snowboard",
  snowshoe: "Raquete de Neve",
  "ice-skate": "Patinação no Gelo",
  "inline-skate": "Patinação Inline",
  "roller-ski": "Esqui de Rodas",
  skateboard: "Skate",
  "rock-climbing": "Escalada em Rocha",
};

/**
 * Type guard: indica se um valor arbitrário é um `RyvanoSportType` válido.
 */
export function isRyvanoSportType(value: unknown): value is RyvanoSportType {
  return (
    typeof value === "string" &&
    (RYVANO_SPORT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Retorna o rótulo legível de um esporte canônico.
 */
export function getRyvanoSportLabel(sport: RyvanoSportType): string {
  return RYVANO_SPORT_LABELS[sport];
}

/**
 * Ponte para a taxonomia legada `SportIconName` de `lib/sports.ts`.
 *
 * `lib/sports.ts` só conhece um subconjunto restrito de esportes
 * (`swim | bike | run | triathlon | multisport | walking | strength | default`),
 * usado por ícones e cores. Esportes canônicos sem equivalente exato caem no
 * agrupamento mais próximo (ex.: `mtb` → `bike`, `crossfit` → `strength`) ou em
 * `default` quando não há correspondência sensata.
 *
 * _Requisitos: 7.3, 7.4, 7.5_
 */
const RYVANO_TO_LEGACY: Record<RyvanoSportType, SportIconName> = {
  default: "default",
  swim: "swim",
  "open-water": "swim",
  bike: "bike",
  mtb: "bike",
  run: "run",
  "trail-run": "run",
  triathlon: "triathlon",
  duathlon: "multisport",
  aquathlon: "multisport",
  walking: "walking",
  hiking: "walking",
  gym: "strength",
  crossfit: "strength",
  football: "default",
  futsal: "default",
  basketball: "default",
  volleyball: "default",
  tennis: "default",
  padel: "default",
  surf: "default",
  rowing: "default",
  kayak: "default",
  "stand-up-paddle": "default",
  // Resistência com ritmo / ciclismo: há agrupamento legado equivalente.
  wheelchair: "walking",
  handcycle: "bike",
  // Vento e vela: sem agrupamento legado equivalente.
  kitesurf: "default",
  sail: "default",
  windsurf: "default",
  // Esportes coletivos e de raquete: sem agrupamento legado equivalente.
  pickleball: "default",
  badminton: "default",
  squash: "default",
  "table-tennis": "default",
  racquetball: "default",
  golf: "default",
  cricket: "default",
  // Força e estúdio: `strength` é o agrupamento legado de ícone/cor mais
  // próximo, mas dança não é treino de força — fica em `default`.
  dance: "default",
  // Neve, gelo e aventura: sem agrupamento legado equivalente.
  "alpine-ski": "default",
  "backcountry-ski": "default",
  "nordic-ski": "default",
  snowboard: "default",
  snowshoe: "default",
  "ice-skate": "default",
  "inline-skate": "default",
  "roller-ski": "default",
  skateboard: "default",
  "rock-climbing": "default",
};

/**
 * Converte um `RyvanoSportType` para a taxonomia legada `SportIconName`
 * (`lib/sports.ts`), garantindo que todo esporte canônico produza um valor
 * legado válido (com fallback em `default`).
 *
 * _Requisitos: 7.3, 7.4, 7.5_
 */
export function mapRyvanoSportToLegacy(sport: RyvanoSportType): SportIconName {
  return RYVANO_TO_LEGACY[sport] ?? "default";
}

/**
 * Ponte para `ReportThemeSport` de `lib/reports/types.ts`.
 *
 * `ReportThemeSport` compartilha exatamente o mesmo espaço de valores que
 * `RyvanoSportType`, então o mapeamento é uma identidade. O `Record` explícito
 * garante, em tempo de compilação, que todo esporte canônico corresponde a um
 * `ReportThemeSport` válido — se as taxonomias divergirem no futuro, o
 * TypeScript acusará o erro aqui.
 *
 * _Requisitos: 7.3, 7.4, 7.5_
 */
const RYVANO_TO_REPORT_THEME: Record<RyvanoSportType, ReportThemeSport> = {
  default: "default",
  swim: "swim",
  "open-water": "open-water",
  bike: "bike",
  mtb: "mtb",
  run: "run",
  "trail-run": "trail-run",
  triathlon: "triathlon",
  duathlon: "duathlon",
  aquathlon: "aquathlon",
  walking: "walking",
  hiking: "hiking",
  gym: "gym",
  crossfit: "crossfit",
  football: "football",
  futsal: "futsal",
  basketball: "basketball",
  volleyball: "volleyball",
  tennis: "tennis",
  padel: "padel",
  surf: "surf",
  rowing: "rowing",
  kayak: "kayak",
  "stand-up-paddle": "stand-up-paddle",
  wheelchair: "wheelchair",
  handcycle: "handcycle",
  kitesurf: "kitesurf",
  sail: "sail",
  windsurf: "windsurf",
  pickleball: "pickleball",
  badminton: "badminton",
  squash: "squash",
  "table-tennis": "table-tennis",
  racquetball: "racquetball",
  golf: "golf",
  cricket: "cricket",
  dance: "dance",
  "alpine-ski": "alpine-ski",
  "backcountry-ski": "backcountry-ski",
  "nordic-ski": "nordic-ski",
  snowboard: "snowboard",
  snowshoe: "snowshoe",
  "ice-skate": "ice-skate",
  "inline-skate": "inline-skate",
  "roller-ski": "roller-ski",
  skateboard: "skateboard",
  "rock-climbing": "rock-climbing",
};

/**
 * Converte um `RyvanoSportType` para o `ReportThemeSport` usado pelos temas de
 * relatório, garantindo um valor válido (com fallback em `default`).
 *
 * _Requisitos: 7.3, 7.4, 7.5_
 */
export function mapRyvanoSportToReportTheme(
  sport: RyvanoSportType,
): ReportThemeSport {
  return RYVANO_TO_REPORT_THEME[sport] ?? "default";
}
