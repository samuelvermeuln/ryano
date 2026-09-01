import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  getMetricDisplayCategory,
  METRIC_DISPLAY_RULES,
  type MetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import {
  RYVANO_SPORT_TYPES,
  type RyvanoSportType,
} from "@/modules/shared/activities/sport-types";
import { parseStravaSportType } from "@/modules/strava/parsers/parse-strava-sport-type";

const NUM_RUNS = 300;

/**
 * Transcrição, feita no teste, das chaves de `EXACT_SPORT_TYPES` do parser
 * (que não são exportadas). Serve apenas para o gerador rejeitar valores
 * conhecidos — o teste nunca afirma nada sobre o mapeamento desses valores
 * (isso é escopo dos testes de exemplo).
 */
const KNOWN_EXACT_KEYS: readonly string[] = [
  "run",
  "virtual_run",
  "trail_run",
  "wheelchair",
  "ride",
  "gravel_ride",
  "virtual_ride",
  "e_bike_ride",
  "velomobile",
  "mountain_bike_ride",
  "e_mountain_bike_ride",
  "handcycle",
  "swim",
  "walk",
  "hike",
  "weight_training",
  "workout",
  "high_intensity_interval_training",
  "elliptical",
  "stair_stepper",
  "yoga",
  "pilates",
  "physical_therapy",
  "crossfit",
  "dance",
  "rowing",
  "virtual_row",
  "kayaking",
  "canoeing",
  "stand_up_paddling",
  "surfing",
  "kitesurf",
  "sail",
  "windsurf",
  "soccer",
  "football",
  "futsal",
  "basketball",
  "volleyball",
  "tennis",
  "padel",
  "pickleball",
  "badminton",
  "squash",
  "table_tennis",
  "racquetball",
  "golf",
  "cricket",
  "alpine_ski",
  "backcountry_ski",
  "nordic_ski",
  "snowboard",
  "snowshoe",
  "ice_skate",
  "inline_skate",
  "roller_ski",
  "skateboard",
  "rock_climbing",
];

/**
 * Transcrição das palavras-chave de `KEYWORD_RULES` do parser (também não
 * exportadas), achatadas em uma única lista — a ordem das regras é irrelevante
 * aqui, porque o gerador só precisa saber se alguma delas pode casar.
 */
const KNOWN_KEYWORDS: readonly string[] = [
  "open water",
  "aguas abertas",
  "agua aberta",
  "mountain bik",
  "mtb",
  "downhill",
  "trail",
  "ultra",
  "swim",
  "natac",
  "piscina",
  "bike",
  "ride",
  "cycl",
  "cicl",
  "pedal",
  "run",
  "corr",
  "hike",
  "hik",
  "trilha",
  "mountaineer",
  "walk",
  "caminh",
  "crossfit",
  "row",
  "remo",
  "kayak",
  "canoe",
  "caiaque",
  "stand up paddle",
  "paddl",
  "sup",
  "kitesurf",
  "kite surf",
  "kiteboard",
  "windsurf",
  "wind surf",
  "sail",
  "veleiro",
  "vela",
  "surf",
  "futsal",
  "soccer",
  "football",
  "futebol",
  "basket",
  "basquete",
  "volley",
  "volei",
  "padel",
  "tennis",
  "tenis",
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
];

/**
 * O parser normaliza o valor bruto antes de comparar: separa transições
 * PascalCase/camelCase e dígitos, minúsculas, remove diacríticos e unifica
 * `_`/`-`/`.`/espaços. Para decidir se um candidato é realmente *desconhecido*
 * o gerador precisa considerar todas essas leituras possíveis — então gera
 * variantes **mais permissivas** que a normalização do parser (inclusive uma
 * versão sem separador algum) e rejeita o candidato se qualquer variante puder
 * casar. Rejeitar demais é seguro: só reduz o espaço amostral, nunca deixa
 * passar um valor conhecido.
 */
function candidateVariants(raw: string): readonly string[] {
  const withoutDiacritics = (value: string): string =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const asWords = (value: string): string =>
    withoutDiacritics(value)
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const camelSplit = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2");

  const collapsed = withoutDiacritics(raw).replace(/[^a-z0-9]+/g, "");

  return [asWords(raw), asWords(camelSplit), collapsed];
}

/**
 * `true` quando nenhuma leitura possível do candidato corresponde a um valor
 * exato conhecido nem contém qualquer palavra-chave conhecida.
 */
function isUnknownSportTypeValue(raw: string): boolean {
  const variants = candidateVariants(raw);
  const collapsed = variants[variants.length - 1] ?? "";

  for (const variant of variants) {
    if (KNOWN_EXACT_KEYS.includes(variant.replace(/ /g, "_"))) {
      return false;
    }

    for (const keyword of KNOWN_KEYWORDS) {
      if (variant.includes(keyword)) {
        return false;
      }

      // Sem separadores, "stand up paddle" viraria "standuppaddle".
      if (collapsed.includes(keyword.replace(/ /g, ""))) {
        return false;
      }
    }
  }

  return true;
}

/** Sílabas sem relação com nenhuma palavra-chave conhecida. */
const NONSENSE_SYLLABLES = [
  "Zeq",
  "Vunt",
  "Bleq",
  "Grot",
  "Plim",
  "Xandu",
  "Quev",
  "Mozz",
  "Thyx",
  "Ondel",
] as const;

/** Valor "PascalCase" plausível como `sport_type` de um provider desconhecido. */
const pascalCaseUnknown: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...NONSENSE_SYLLABLES), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(""));

/** Mesma ideia, mas com separadores (`_`, `-`, `.`, espaço) e dígitos. */
const separatedUnknown: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(fc.constantFrom(...NONSENSE_SYLLABLES), { minLength: 1, maxLength: 4 }),
    fc.constantFrom("_", "-", ".", " ", "  "),
    fc.option(fc.integer({ min: 0, max: 9999 }), { nil: undefined }),
  )
  .map(([parts, separator, suffix]) => {
    const joined = parts.join(separator);
    return suffix === undefined ? joined : `${joined}${separator}${suffix}`;
  });

/** Ruído textual livre: acentos, unicode, pontuação, espaços, vazio. */
const noisyUnknown: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "",
    " ",
    "\t\n  ",
    "???",
    "---",
    "___",
    "...",
    "42",
    "0",
    // Diacr\u00edticos e unicode fora do BMP, escapados para manter o arquivo ASCII.
    "\u00e3\u00e9\u00ed\u00f5\u00fc\u00e7",
    "\u2728\u{1F6B4}",
    "<script>",
    "null",
    "undefined",
    "NaN",
  ),
  fc.string({ maxLength: 24 }),
  fc.fullUnicodeString({ maxLength: 24 }),
);

/**
 * `sport_type` desconhecido: qualquer um dos formatos acima que sobreviva ao
 * filtro de valores/palavras-chave conhecidos.
 */
const unknownSportTypeValue: fc.Arbitrary<string> = fc
  .oneof(
    { arbitrary: pascalCaseUnknown, weight: 3 },
    { arbitrary: separatedUnknown, weight: 3 },
    { arbitrary: noisyUnknown, weight: 2 },
  )
  .filter(isUnknownSportTypeValue);

/** String bruta sem filtro algum — inclui valores conhecidos e lixo. */
const anyRawValue: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.string({ maxLength: 40 }), weight: 3 },
  { arbitrary: fc.fullUnicodeString({ maxLength: 40 }), weight: 2 },
  { arbitrary: unknownSportTypeValue, weight: 2 },
);

/**
 * Providers simulados só no contexto do teste. `parseStravaSportType` e
 * `getMetricDisplayCategory` não recebem provider algum — estes identificadores
 * existem apenas para expressar "de qualquer provider" no enunciado da
 * propriedade.
 */
const simulatedProviderId: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom("GARMIN", "STRAVA", "POLAR", "COROS"), weight: 3 },
  { arbitrary: fc.string({ minLength: 1, maxLength: 12 }), weight: 1 },
);

const KNOWN_SPORT_TYPES = new Set<string>(RYVANO_SPORT_TYPES);
const KNOWN_CATEGORIES = new Set<string>(Object.keys(METRIC_DISPLAY_RULES));

/** Categoria de fallback esperada para o esporte `"default"`. */
const FALLBACK_CATEGORY: MetricDisplayCategory = "default";

/**
 * Feature: detalhe-atividade-multi-provider, Property 18: `sport_type`
 * desconhecido de qualquer provider cai sempre na categoria padrão, sem erro —
 * para qualquer string arbitrária que não corresponda a nenhum valor conhecido
 * de `EXACT_SPORT_TYPES` nem a nenhuma palavra-chave de `KEYWORD_RULES`,
 * `parseStravaSportType` retorna `"default"` e `getMetricDisplayCategory`
 * devolve a categoria de fallback, sem lançar exceção em nenhum caso.
 *
 * **Validates: Requirements 12.3**
 */
describe("parseStravaSportType com sport_type desconhecido (Property 18)", () => {
  it("retorna sempre \"default\" para valor desconhecido, sem lançar", () => {
    fc.assert(
      fc.property(unknownSportTypeValue, (rawValue) => {
        const sportType: RyvanoSportType = parseStravaSportType(rawValue);

        expect(sportType).toBe("default");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("encadeia até a categoria de fallback, com as regras de exibição padrão", () => {
    fc.assert(
      fc.property(unknownSportTypeValue, (rawValue) => {
        const category = getMetricDisplayCategory(parseStravaSportType(rawValue));

        expect(category).toBe(FALLBACK_CATEGORY);
        expect(METRIC_DISPLAY_RULES[category]).toBe(
          METRIC_DISPLAY_RULES[FALLBACK_CATEGORY],
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("independe do provider de origem: o mesmo valor desconhecido cai no fallback para qualquer provider", () => {
    fc.assert(
      fc.property(
        unknownSportTypeValue,
        fc.array(simulatedProviderId, { minLength: 1, maxLength: 6 }),
        (rawValue, providerIds) => {
          const categories = providerIds.map(() =>
            getMetricDisplayCategory(parseStravaSportType(rawValue)),
          );

          for (const category of categories) {
            expect(category).toBe(FALLBACK_CATEGORY);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("nunca lança para string arbitrária: sempre devolve esporte e categoria conhecidos", () => {
    fc.assert(
      fc.property(anyRawValue, (rawValue) => {
        const sportType = parseStravaSportType(rawValue);
        const category = getMetricDisplayCategory(sportType);

        expect(KNOWN_SPORT_TYPES.has(sportType)).toBe(true);
        expect(KNOWN_CATEGORIES.has(category)).toBe(true);
        expect(METRIC_DISPLAY_RULES[category]).toBeDefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
