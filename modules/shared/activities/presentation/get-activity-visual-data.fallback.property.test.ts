/**
 * Testes de propriedade do fallback para a visão base em `getActivityVisualData`.
 *
 * Feature: detalhe-atividade-multi-provider, Property 2: Ausência de
 * enriquecedor cai sempre na visão base, nunca em erro ou vazio.
 * Feature: detalhe-atividade-multi-provider, Property 12:
 * `getActivityVisualData` nunca lança e sempre retorna uma visão válida, para
 * qualquer combinação de dados opcionais ausentes.
 *
 * **Validates: Requirements 1.3, 7.3**
 *
 * Estratégia: o dispatcher só tem dois pontos de decisão — a capability
 * `activityDetails` (lida do catálogo via `hasCapability`) e a entrada do
 * provider no registry de enriquecedores. Ambos são sandboxados aqui, seguindo o
 * mesmo padrão do teste das Properties 1/11
 * (`activity-detail-enrichment-registry.property.test.ts`):
 *
 * - `ACTIVITY_DETAIL_ENRICHER_LOADERS` é substituído por entradas fake e
 *   restaurado ao estado real depois de cada teste — nenhum teste aqui deixa um
 *   loader real no registry, então nenhum módulo de provider é carregado de
 *   verdade;
 * - `setProviderCapabilitiesResolver` injeta as capabilities declaradas, que é
 *   exatamente como o catálogo as publica em produção.
 *
 * Providers sintéticos (`FUTURE_*`) entram nos geradores junto com os do
 * catálogo: o caminho de fallback não pode depender de qual `ProviderId` é.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import {
  METRIC_DISPLAY_RULES,
  getMetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import {
  RYVANO_SPORT_TYPES,
  type RyvanoSportType,
} from "@/modules/shared/activities/sport-types";
import {
  ACTIVITY_DETAIL_ENRICHER_LOADERS,
  type ActivityDetailEnricher,
  type ActivityDetailEnricherLoader,
} from "@/modules/shared/activities/presentation/activity-detail-enrichment-registry";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import {
  buildBaseActivityVisualData,
  getActivityVisualData,
} from "@/modules/shared/activities/presentation/get-activity-visual-data";
import {
  setProviderCapabilitiesResolver,
  type ProviderCapabilities,
  type ProviderCapabilitiesResolver,
} from "@/modules/shared/integrations/capabilities";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";

const NUM_RUNS = 200;

/** Entradas reais do registry, capturadas antes de qualquer injeção de teste. */
const SHIPPED_LOADERS: Partial<Record<ProviderId, ActivityDetailEnricherLoader>> = {
  ...ACTIVITY_DETAIL_ENRICHER_LOADERS,
};

/**
 * Resolver real do catálogo (mesma expressão registrada por
 * `modules/shared/integrations/catalog`), usado para restaurar o estado de
 * produção depois de cada injeção — em vez de `resetProviderCapabilitiesResolver`,
 * que deixaria o core sem nenhuma capability declarada.
 */
const CATALOG_CAPABILITIES_RESOLVER: ProviderCapabilitiesResolver = (providerId) =>
  getProviderDefinition(providerId)?.capabilities;

const CATALOG_PROVIDER_IDS: readonly ProviderId[] = [
  "GARMIN",
  "STRAVA",
  "POLAR",
  "COROS",
  "SUUNTO",
  "FITBIT",
];

// ---------------------------------------------------------------------------
// Arbitraries — providers
// ---------------------------------------------------------------------------

const catalogProviderId: fc.Arbitrary<ProviderId> = fc.constantFrom(
  ...CATALOG_PROVIDER_IDS,
);

/**
 * Provider fora do catálogo, simulando um provider futuro. O prefixo garante
 * que o identificador sintético nunca colide com um `ProviderId` real nem com
 * chaves especiais de objeto (`__proto__`).
 */
const syntheticProviderId: fc.Arbitrary<ProviderId> = fc
  .string({ minLength: 1, maxLength: 8 })
  .map((suffix) => `FUTURE_${suffix}` as ProviderId);

const anyProviderId: fc.Arbitrary<ProviderId> = fc.oneof(
  catalogProviderId,
  syntheticProviderId,
);

// ---------------------------------------------------------------------------
// Arbitraries — atividade normalizada
// ---------------------------------------------------------------------------

/**
 * Valores crus de `sportType` que um provider pode ter persistido: modalidade
 * canônica, a mesma em caixa alta (o dispatcher normaliza para minúsculas),
 * chave legada não canônica e string vazia. Todos caem em uma categoria de
 * exibição válida — a não canônica na categoria `"default"`.
 */
const sportTypeArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...RYVANO_SPORT_TYPES),
  fc.constantFrom<string>(...RYVANO_SPORT_TYPES).map((sport) => sport.toUpperCase()),
  fc.constantFrom(
    "lap_swimming",
    "indoor_cycling",
    "sport_type_do_futuro",
    "Kite Boarding",
    "",
  ),
);

const optionalInt = (min: number, max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.integer({ min, max }), { nil: null });

const optionalFloat = (min: number, max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.double({ min, max, noNaN: true }), { nil: null });

/**
 * Campos opcionais da atividade normalizada, cada um ausente (`null`) de forma
 * independente — é o espaço de entrada da Property 12. Os intervalos são
 * fisicamente plausíveis: o alvo da propriedade é a **combinação de ausências**,
 * não valores impossíveis de medição.
 *
 * `startedAt` e `sportType` não são opcionais: o modelo persistido
 * (`Activity` do Prisma) os declara obrigatórios.
 */
const optionalActivityFields = {
  durationSeconds: optionalInt(0, 86_400),
  distanceMeters: optionalFloat(0, 300_000),
  calories: optionalInt(0, 10_000),
  averageHeartRate: optionalInt(30, 220),
  maxHeartRate: optionalInt(30, 230),
  averagePace: optionalFloat(45, 1_800),
  averageSpeed: optionalFloat(0, 30),
  maxSpeed: optionalFloat(0, 40),
  elevationGain: optionalFloat(0, 5_000),
  averageCadence: optionalFloat(0, 220),
  averagePower: optionalFloat(0, 1_500),
  maxPower: optionalFloat(0, 2_000),
};

type OptionalActivityFields = {
  [K in keyof typeof optionalActivityFields]: number | null;
};

interface ActivityData extends OptionalActivityFields {
  sportType: string;
  startedAt: Date;
}

const startedAtArb = fc.date({
  min: new Date("2015-01-01T00:00:00.000Z"),
  max: new Date("2035-12-31T23:59:59.000Z"),
  noInvalidDate: true,
});

const activityDataArb: fc.Arbitrary<ActivityData> = fc.record({
  sportType: sportTypeArb,
  startedAt: startedAtArb,
  ...optionalActivityFields,
});

/**
 * Atividade com ao menos o campo mínimo de destaque presente (duração — o
 * tempo decorrido que todo provider normaliza), e todo o resto ausente de forma
 * arbitrária.
 */
const activityDataWithDurationArb: fc.Arbitrary<ActivityData> = fc.record({
  sportType: sportTypeArb,
  startedAt: startedAtArb,
  ...optionalActivityFields,
  durationSeconds: fc.integer({ min: 1, max: 86_400 }),
});

function makeActivity(providerId: string, data: ActivityData): Activity {
  return {
    id: "activity-under-test",
    userId: "user-under-test",
    wearableConnectionId: "connection-under-test",
    externalId: "external-under-test",
    provider: providerId,
    providerSportType: null,
    name: null,
    endedAt: null,
    movingSeconds: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...data,
  } as unknown as Activity;
}

const activityArb = (
  dataArb: fc.Arbitrary<ActivityData> = activityDataArb,
): fc.Arbitrary<Activity> =>
  fc
    .tuple(anyProviderId, dataArb)
    .map(([providerId, data]) => makeActivity(providerId, data));

// ---------------------------------------------------------------------------
// Sandbox do registry e das capabilities
// ---------------------------------------------------------------------------

/** Substitui todo o conteúdo do registry (limpa e reinsere). */
function replaceRegistry(
  entries: Partial<Record<ProviderId, ActivityDetailEnricherLoader>>,
): void {
  for (const key of Object.keys(ACTIVITY_DETAIL_ENRICHER_LOADERS) as ProviderId[]) {
    delete ACTIVITY_DETAIL_ENRICHER_LOADERS[key];
  }

  Object.assign(ACTIVITY_DETAIL_ENRICHER_LOADERS, entries);
}

/** Declara as capabilities de um único provider; qualquer outro fica sem nenhuma. */
function declareCapabilities(
  providerId: ProviderId,
  capabilities: ProviderCapabilities,
): void {
  setProviderCapabilitiesResolver((candidate) =>
    candidate === providerId ? capabilities : undefined,
  );
}

afterEach(() => {
  replaceRegistry(SHIPPED_LOADERS);
  setProviderCapabilitiesResolver(CATALOG_CAPABILITIES_RESOLVER);
});

// ---------------------------------------------------------------------------
// Dublês de enriquecedor
// ---------------------------------------------------------------------------

/** Visão enriquecida sintética, distinta de qualquer visão base possível. */
function enrichedVisualData(providerId: string): ActivityVisualData {
  return {
    sportLabel: "Enriquecido",
    sportKey: "enriched",
    provider: providerId,
    startedAtLabel: "01/02/2026 07:40",
    heroStats: [{ label: "Duração", value: "45 min", tone: "text-cyan-200" }],
    overviewMetrics: [{ label: "FC média", value: "142 bpm" }],
    barSections: [
      {
        id: "hr-zones",
        title: "Zonas de frequência cardíaca",
        description: "Tempo em cada faixa de intensidade.",
        items: [
          { label: "Z2", valueText: "20:00", ratio: 0.45, color: "var(--chart-2)" },
        ],
      },
    ],
    metricSections: [],
  };
}

/** Como um enriquecedor registrado pode se comportar mal (Requisitos 1.3, 7.3). */
type EnricherFailureMode =
  | "loader-rejects"
  | "loader-returns-non-function"
  | "enricher-throws-sync"
  | "enricher-rejects"
  | "enricher-returns-null";

interface FakeLoader {
  loader: ActivityDetailEnricherLoader;
  /** Quantas vezes o loader foi acionado. */
  loadCount: number;
}

function failingLoader(mode: EnricherFailureMode): FakeLoader {
  const enricher: ActivityDetailEnricher = async () => {
    if (mode === "enricher-rejects") {
      throw new Error("provider request failed");
    }

    return null;
  };

  const throwingEnricher = (() => {
    throw new Error("provider enricher exploded synchronously");
  }) as unknown as ActivityDetailEnricher;

  const entry: FakeLoader = {
    loadCount: 0,
    loader: async () => {
      entry.loadCount += 1;

      switch (mode) {
        case "loader-rejects":
          // Módulo do provider ausente / export ainda não publicado.
          throw new Error("provider module not available");
        case "loader-returns-non-function":
          return undefined as unknown as ActivityDetailEnricher;
        case "enricher-throws-sync":
          return throwingEnricher;
        default:
          return enricher;
      }
    },
  };

  return entry;
}

/** Loader bem-comportado, usado só para provar que os testes não são vazios. */
function succeedingLoader(providerId: string): FakeLoader {
  const entry: FakeLoader = {
    loadCount: 0,
    loader: async () => {
      entry.loadCount += 1;
      return async () => enrichedVisualData(providerId);
    },
  };

  return entry;
}

// ---------------------------------------------------------------------------
// Property 2 — sem enriquecedor disponível, sempre a visão base
// ---------------------------------------------------------------------------

describe("getActivityVisualData sem enriquecedor disponível (Property 2)", () => {
  it("sem a capability activityDetails, retorna exatamente a visão base e nem consulta o registry", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyProviderId,
        activityDataArb,
        // Capabilities de dado presentes/ausentes não devem abrir o caminho de
        // enriquecimento: só `activityDetails` decide.
        fc.record({
          activityDetails: fc.constant(false as const),
          streams: fc.boolean(),
          laps: fc.boolean(),
          heartRateZones: fc.boolean(),
        }),
        async (providerId, data, capabilities) => {
          const activity = makeActivity(providerId, data);
          const entry = succeedingLoader(providerId);

          declareCapabilities(providerId, capabilities);
          // O provider TEM enriquecedor registrado; falta apenas a capability.
          replaceRegistry({ [providerId]: entry.loader });

          const result = await getActivityVisualData(activity);

          expect(result).toEqual(buildBaseActivityVisualData(activity));
          expect(entry.loadCount).toBe(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("com a capability mas sem entrada no registry, retorna exatamente a visão base", async () => {
    await fc.assert(
      fc.asyncProperty(anyProviderId, activityDataArb, async (providerId, data) => {
        const activity = makeActivity(providerId, data);

        declareCapabilities(providerId, {
          activityDetails: true,
          streams: true,
          laps: true,
          heartRateZones: true,
        });
        replaceRegistry({});

        const result = await getActivityVisualData(activity);

        expect(result).toEqual(buildBaseActivityVisualData(activity));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("qualquer combinação em que falte a capability OU a entrada no registry cai na visão base, sem lançar", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyProviderId,
        activityDataArb,
        fc.boolean(),
        fc.boolean(),
        async (providerId, data, hasDetailCapability, isRegistered) => {
          // O caso em que ambos existem é enriquecimento (Property 1), não fallback.
          fc.pre(!(hasDetailCapability && isRegistered));

          const activity = makeActivity(providerId, data);
          const entry = succeedingLoader(providerId);

          declareCapabilities(providerId, { activityDetails: hasDetailCapability });
          replaceRegistry(isRegistered ? { [providerId]: entry.loader } : {});

          const result = await getActivityVisualData(activity);

          expect(result).toEqual(buildBaseActivityVisualData(activity));
          // Sem enriquecimento não significa visão vazia (Requisito 1.3).
          expect(result.overviewMetrics.length).toBeGreaterThan(0);
          expect(result.barSections).toEqual([]);
          expect(result.metricSections).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("enriquecedor registrado que falha ou não tem dado cai na visão base, sem propagar erro", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyProviderId,
        activityDataArb,
        fc.constantFrom<EnricherFailureMode>(
          "loader-rejects",
          "loader-returns-non-function",
          "enricher-throws-sync",
          "enricher-rejects",
          "enricher-returns-null",
        ),
        async (providerId, data, mode) => {
          const activity = makeActivity(providerId, data);
          const entry = failingLoader(mode);

          declareCapabilities(providerId, { activityDetails: true });
          replaceRegistry({ [providerId]: entry.loader });

          const result = await getActivityVisualData(activity);

          expect(result).toEqual(buildBaseActivityVisualData(activity));
          // O caminho de enriquecimento foi de fato exercitado e absorvido.
          expect(entry.loadCount).toBe(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("guarda de vacuidade: com capability e enriquecedor válidos, o resultado NÃO é a visão base", async () => {
    await fc.assert(
      fc.asyncProperty(anyProviderId, activityDataArb, async (providerId, data) => {
        const activity = makeActivity(providerId, data);
        const entry = succeedingLoader(providerId);

        declareCapabilities(providerId, { activityDetails: true });
        replaceRegistry({ [providerId]: entry.loader });

        const result = await getActivityVisualData(activity);

        expect(result).toEqual(enrichedVisualData(providerId));
        expect(result).not.toEqual(buildBaseActivityVisualData(activity));
        expect(entry.loadCount).toBe(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12 — nunca lança, sempre uma visão válida
// ---------------------------------------------------------------------------

/** Rótulos com valor `"—"` denunciariam um placeholder vazio (Requisito 7.3). */
function placeholderRows(view: ActivityVisualData): string[] {
  return [...view.heroStats, ...view.overviewMetrics]
    .filter((row) => row.value === "—" || row.value.trim() === "")
    .map((row) => row.label);
}

describe("getActivityVisualData com dados opcionais ausentes (Property 12)", () => {
  it("nunca lança e sempre devolve uma visão estruturalmente válida, para qualquer combinação de ausências", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityArb(),
        fc.boolean(),
        fc.boolean(),
        async (activity, hasDetailCapability, isRegistered) => {
          const providerId = activity.provider as ProviderId;
          const entry = failingLoader("enricher-returns-null");

          declareCapabilities(providerId, {
            activityDetails: hasDetailCapability,
            streams: false,
            laps: false,
            heartRateZones: false,
          });
          replaceRegistry(isRegistered ? { [providerId]: entry.loader } : {});

          const result = await getActivityVisualData(activity);

          // Sem dado de enriquecimento, o resultado é sempre a visão base.
          expect(result).toEqual(buildBaseActivityVisualData(activity));

          expect(typeof result.sportKey).toBe("string");
          expect(result.sportKey.length).toBeGreaterThan(0);
          expect(result.provider).toBe(activity.provider);
          expect(Array.isArray(result.heroStats)).toBe(true);
          expect(Array.isArray(result.overviewMetrics)).toBe(true);
          expect(result.barSections).toEqual([]);
          expect(result.metricSections).toEqual([]);

          // A página nunca renderiza vazia: `startedAt` é obrigatório no modelo
          // persistido, então a linha "Início" está sempre presente.
          expect(result.overviewMetrics.length).toBeGreaterThan(0);
          expect(result.overviewMetrics.map((row) => row.label)).toContain("Início");
          expect(result.startedAtLabel).not.toBe("—");

          // Dado ausente é omitido, nunca exibido como placeholder.
          expect(placeholderRows(result)).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("heroStats e overviewMetrics não ficam vazios quando o campo mínimo (duração) existe", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityArb(activityDataWithDurationArb),
        async (activity) => {
          declareCapabilities(activity.provider as ProviderId, {
            activityDetails: false,
          });
          replaceRegistry({});

          const result = await getActivityVisualData(activity);

          expect(result.heroStats.length).toBeGreaterThan(0);
          expect(result.heroStats.map((stat) => stat.label)).toContain("Duração");
          expect(result.overviewMetrics.length).toBeGreaterThan(0);
          expect(result.overviewMetrics.map((row) => row.label)).toContain("Duração");
          expect(placeholderRows(result)).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("atividade sem nenhuma fonte de destaque omite os destaques em vez de fabricar placeholders", async () => {
    /**
     * Fronteira do caso degenerado: modalidades cuja categoria não exibe ritmo
     * nem velocidade (força e estúdio, coletivos e de raquete, padrão) e sem
     * duração, distância nem calorias não têm nenhum destaque a exibir. O
     * comportamento correto é `heroStats` vazio — omissão graciosa —, e não uma
     * linha `"—"` (Requisito 7.3). A visão continua renderizável pelo resumo.
     */
    const sportsWithoutHeroFallback = RYVANO_SPORT_TYPES.filter(
      (sport: RyvanoSportType) => {
        const rules = METRIC_DISPLAY_RULES[getMetricDisplayCategory(sport)];
        return rules.pace === false && !rules.speedFallback;
      },
    );

    expect(sportsWithoutHeroFallback.length).toBeGreaterThan(0);

    await fc.assert(
      fc.asyncProperty(
        anyProviderId,
        fc.constantFrom(...sportsWithoutHeroFallback),
        startedAtArb,
        // Ritmo/velocidade brutos presentes: a categoria os ignora (Requisito 5.6).
        optionalFloat(45, 1_800),
        optionalFloat(0, 30),
        async (providerId, sportType, startedAt, averagePace, averageSpeed) => {
          const activity = makeActivity(providerId, {
            sportType,
            startedAt,
            durationSeconds: null,
            distanceMeters: null,
            calories: null,
            averageHeartRate: null,
            maxHeartRate: null,
            averagePace,
            averageSpeed,
            maxSpeed: null,
            elevationGain: null,
            averageCadence: null,
            averagePower: null,
            maxPower: null,
          });

          declareCapabilities(providerId, { activityDetails: false });
          replaceRegistry({});

          const result = await getActivityVisualData(activity);

          expect(result.heroStats).toEqual([]);
          expect(placeholderRows(result)).toEqual([]);
          // Mesmo no caso degenerado a visão não é vazia.
          expect(result.overviewMetrics.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
