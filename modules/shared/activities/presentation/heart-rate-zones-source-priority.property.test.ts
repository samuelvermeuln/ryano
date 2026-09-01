/**
 * Teste de propriedade da prioridade entre fontes de zonas de frequência
 * cardíaca (nativa vs. calculada) na composição do detalhe de atividade.
 *
 * Feature: detalhe-atividade-multi-provider, Property 3: Zonas de FC nativas
 * têm prioridade sobre zonas calculadas.
 *
 * **Validates: Requirements 2.2**
 *
 * ## Por que um provider sintético
 *
 * A regra do Requisito 2.2 só é observável quando **as duas fontes coexistem**
 * para a mesma atividade. Nenhum provider real desta spec está nessa situação:
 * o Garmin só oferece zonas nativas (`hr-zones`) e o Strava, por decisão
 * arquitetural registrada no requirements.md, só oferece a fonte calculada (o
 * endpoint nativo de zonas por atividade é exclusivo de contas Summit e o de
 * zonas do atleta exigiria o scope `profile:read_all`). Por isso este teste
 * exercita a regra no nível do **core/composição**, com um provider sintético
 * registrado apenas em teste que pode oferecer as duas fontes — não uma
 * capability real do Strava.
 *
 * O caminho de código exercitado é o mesmo de qualquer provider real:
 * `getActivityVisualData` resolve a capability `activityDetails` e o
 * enriquecedor pelo registry, e o enriquecedor compõe a seção de zonas com
 * `computeHeartRateZonesFromStream`/`resolveMaxHeartRateReference` (os mesmos
 * helpers compartilhados que o módulo Strava usa) quando não há fonte nativa.
 *
 * ## Sandbox (mesmo padrão das Properties 1/2/11/12)
 *
 * - `ACTIVITY_DETAIL_ENRICHER_LOADERS` recebe entradas fake e é restaurado ao
 *   estado real depois de cada teste — nenhum módulo de provider real é
 *   carregado;
 * - `setProviderCapabilitiesResolver` injeta as capabilities declaradas e é
 *   restaurado para o resolver do catálogo (não `reset...`, que deixaria o core
 *   sem nenhuma capability declarada).
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import {
  HEART_RATE_ZONE_COUNT,
  HEART_RATE_ZONE_LABELS,
  HEART_RATE_ZONES_SECTION_ID,
  computeHeartRateZonesFromStream,
  resolveMaxHeartRateReference,
  type HeartRateSample,
} from "@/modules/shared/activities/heart-rate-zones";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";
import {
  ACTIVITY_DETAIL_ENRICHER_LOADERS,
  type ActivityDetailEnricher,
  type ActivityDetailEnricherLoader,
} from "@/modules/shared/activities/presentation/activity-detail-enrichment-registry";
import type {
  ActivityBarSection,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";
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

/** Resolver real do catálogo, usado para restaurar o estado de produção. */
const CATALOG_CAPABILITIES_RESOLVER: ProviderCapabilitiesResolver = (providerId) =>
  getProviderDefinition(providerId)?.capabilities;

/**
 * Capabilities do provider sintético: declara `activityDetails` (abre o caminho
 * de enriquecimento), `streams` e `heartRateZones`. O contrato de capabilities
 * **não** distingue nativa de calculada (Requisito 8.2) — a distinção vive no
 * dado retornado (`approximate`), que é justamente o que esta propriedade
 * observa.
 */
const HYBRID_CAPABILITIES: ProviderCapabilities = {
  activityDetails: true,
  streams: true,
  laps: true,
  heartRateZones: true,
};

// ---------------------------------------------------------------------------
// Composição sob teste — prioridade nativa > calculada
// ---------------------------------------------------------------------------

const NATIVE_ZONES_TITLE = "Zonas de frequência cardíaca";
const NATIVE_ZONES_DESCRIPTION =
  "Tempo em cada zona retornado diretamente pelo provider.";

/** Aviso de aproximação do provider sintético (equivalente ao do Strava real). */
const SYNTHETIC_ZONES_DISCLAIMER =
  "Zonas estimadas por %FC máx. — podem diferir das configuradas no provider de origem.";

/** Fontes de zona de FC que o provider sintético pode ter para uma atividade. */
interface HeartRateZoneSources {
  /** Zonas prontas de um endpoint nativo do provider (`null` = sem fonte nativa). */
  nativeItems: ActivityBarSection["items"] | null;
  /** Série temporal de FC do provider (`null` = sem stream). */
  samples: readonly HeartRateSample[] | null;
}

/**
 * Seção de zonas nativas: dado exato do provider, portanto **sem**
 * `approximate` e **sem** `disclaimer` (contrato de `ActivityBarSection`).
 */
function buildNativeHeartRateZonesSection(
  nativeItems: ActivityBarSection["items"] | null,
): ActivityBarSection | null {
  if (!nativeItems || nativeItems.length === 0) {
    return null;
  }

  return {
    id: HEART_RATE_ZONES_SECTION_ID,
    title: NATIVE_ZONES_TITLE,
    description: NATIVE_ZONES_DESCRIPTION,
    items: [...nativeItems],
  };
}

/**
 * Seção de zonas calculadas a partir do stream de FC — mesma composição que o
 * módulo Strava real faz (cálculo compartilhado + `approximate`/`disclaimer` do
 * provider). Omite graciosamente quando falta stream ou FC máxima de referência
 * (Requisitos 2.4-c, 2.6).
 */
function buildComputedHeartRateZonesSection(
  activity: Activity,
  samples: readonly HeartRateSample[] | null,
): ActivityBarSection | null {
  if (!samples || samples.length === 0) {
    return null;
  }

  const maxHeartRateReference = resolveMaxHeartRateReference({
    maxHeartRate: activity.maxHeartRate,
    averageHeartRate: activity.averageHeartRate,
  });

  if (maxHeartRateReference === null) {
    return null;
  }

  const section = computeHeartRateZonesFromStream(samples, maxHeartRateReference);
  if (!section) {
    return null;
  }

  return {
    ...section,
    approximate: true,
    disclaimer: SYNTHETIC_ZONES_DISCLAIMER,
  };
}

/**
 * **A regra sob teste**: com as duas fontes presentes, a nativa vence; o
 * cálculo interno é apenas o caminho alternativo (Requisitos 2.2, 2.3).
 */
function resolveHeartRateZonesSection(
  activity: Activity,
  sources: HeartRateZoneSources,
): ActivityBarSection | null {
  return (
    buildNativeHeartRateZonesSection(sources.nativeItems) ??
    buildComputedHeartRateZonesSection(activity, sources.samples)
  );
}

// ---------------------------------------------------------------------------
// Provider sintético — registry + capabilities
// ---------------------------------------------------------------------------

/**
 * `ProviderId` fora do catálogo. O prefixo garante que o identificador nunca
 * colide com um provider real nem com chaves especiais de objeto (`__proto__`).
 */
const hybridProviderId: fc.Arbitrary<ProviderId> = fc
  .string({ minLength: 1, maxLength: 8 })
  .map((suffix) => `FUTURE_HYBRID_${suffix}` as ProviderId);

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

/**
 * Registra o provider sintético com um enriquecedor que compõe a seção de zonas
 * a partir das fontes informadas. Retorna `null` quando não há nenhuma fonte —
 * o dispatcher então cai na visão base (Requisito 1.3).
 */
function registerHybridProvider(
  providerId: ProviderId,
  sources: HeartRateZoneSources,
): void {
  const enrich: ActivityDetailEnricher = async (activity) => {
    const section = resolveHeartRateZonesSection(activity, sources);

    if (!section) {
      return null;
    }

    return {
      ...buildBaseActivityVisualData(activity),
      barSections: [section],
    };
  };

  declareCapabilities(providerId, HYBRID_CAPABILITIES);
  replaceRegistry({ [providerId]: async () => enrich });
}

afterEach(() => {
  replaceRegistry(SHIPPED_LOADERS);
  setProviderCapabilitiesResolver(CATALOG_CAPABILITIES_RESOLVER);
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Zonas nativas do provider: rótulos deliberadamente distintos de
 * `HEART_RATE_ZONE_LABELS` (usados pelo cálculo interno), para que a origem da
 * seção surfaceada seja identificável sem ambiguidade — inclusive na contagem
 * de faixas, que a fonte nativa não é obrigada a fixar em 5.
 */
const nativeZoneItemsArb: fc.Arbitrary<ActivityBarSection["items"]> = fc
  .array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 7 })
  .map((ratios) =>
    ratios.map((ratio, index) => ({
      label: `Zona nativa ${index + 1}`,
      valueText: `${index + 1}0:00 nativo`,
      ratio,
      color: "linear-gradient(90deg,#0ea5e9,#22d3ee)",
    })),
  );

/**
 * Série de FC utilizável: ao menos duas amostras com instantes estritamente
 * crescentes, de modo que o cálculo interno tenha intervalo de tempo real para
 * distribuir entre as faixas (uma única amostra produziria uma seção com todos
 * os tempos zerados, um caso degenerado que não é o alvo desta propriedade).
 */
const heartRateSamplesArb: fc.Arbitrary<readonly HeartRateSample[]> = fc
  .array(
    fc.record({
      deltaSeconds: fc.integer({ min: 1, max: 30 }),
      bpm: fc.integer({ min: 40, max: 220 }),
    }),
    { minLength: 2, maxLength: 60 },
  )
  .map((steps) => {
    let timeSeconds = 0;

    return steps.map((step) => {
      timeSeconds += step.deltaSeconds;
      return { timeSeconds, bpm: step.bpm };
    });
  });

const sportTypeArb: fc.Arbitrary<string> = fc.constantFrom<string>(
  ...RYVANO_SPORT_TYPES,
);

const startedAtArb = fc.date({
  min: new Date("2015-01-01T00:00:00.000Z"),
  max: new Date("2035-12-31T23:59:59.000Z"),
  noInvalidDate: true,
});

interface ActivityHeartRate {
  averageHeartRate: number | null;
  maxHeartRate: number | null;
}

/**
 * FC agregada que **garante** FC máxima de referência resolvível (Requisito
 * 2.4-a: `maxHeartRate` presente e maior que `averageHeartRate`). Sem isso o
 * caminho calculado nem seria viável e a propriedade de prioridade seria vazia.
 */
const resolvableHeartRateArb: fc.Arbitrary<ActivityHeartRate> = fc
  .tuple(fc.integer({ min: 60, max: 170 }), fc.integer({ min: 1, max: 50 }))
  .map(([averageHeartRate, delta]) => ({
    averageHeartRate,
    maxHeartRate: averageHeartRate + delta,
  }));

interface ActivityData extends ActivityHeartRate {
  sportType: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number | null;
}

const activityDataArb = (
  heartRateArb: fc.Arbitrary<ActivityHeartRate>,
): fc.Arbitrary<ActivityData> =>
  fc
    .tuple(
      sportTypeArb,
      startedAtArb,
      fc.integer({ min: 1, max: 86_400 }),
      fc.option(fc.double({ min: 0, max: 300_000, noNaN: true }), { nil: null }),
      heartRateArb,
    )
    .map(([sportType, startedAt, durationSeconds, distanceMeters, heartRate]) => ({
      sportType,
      startedAt,
      durationSeconds,
      distanceMeters,
      ...heartRate,
    }));

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
    calories: null,
    averagePace: null,
    averageSpeed: null,
    maxSpeed: null,
    elevationGain: null,
    averageCadence: null,
    averagePower: null,
    maxPower: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...data,
  } as unknown as Activity;
}

// ---------------------------------------------------------------------------
// Helpers de asserção
// ---------------------------------------------------------------------------

function findZonesSection(view: ActivityVisualData): ActivityBarSection | undefined {
  return view.barSections.find((section) => section.id === HEART_RATE_ZONES_SECTION_ID);
}

/** Faixas produzidas pelo cálculo interno, para distinguir a origem da seção. */
const COMPUTED_ZONE_LABELS: readonly string[] = [...HEART_RATE_ZONE_LABELS];

// ---------------------------------------------------------------------------
// Property 3
// ---------------------------------------------------------------------------

describe("prioridade da fonte de zonas de FC (Property 3)", () => {
  it("com fonte nativa E stream de FC presentes, a seção surfaceada é a nativa, sem approximate nem disclaimer", async () => {
    await fc.assert(
      fc.asyncProperty(
        hybridProviderId,
        activityDataArb(resolvableHeartRateArb),
        nativeZoneItemsArb,
        heartRateSamplesArb,
        async (providerId, data, nativeItems, samples) => {
          const activity = makeActivity(providerId, data);

          registerHybridProvider(providerId, { nativeItems, samples });

          const result = await getActivityVisualData(activity);
          const zones = findZonesSection(result);

          expect(zones).toBeDefined();

          // A seção é o dado nativo (Requisito 2.2)...
          expect(zones?.items).toEqual(nativeItems);
          expect(zones?.description).toBe(NATIVE_ZONES_DESCRIPTION);

          // ...e não carrega marca de aproximação nem aviso de divergência
          // (Requisito 2.5 só se aplica a zonas calculadas).
          expect(zones?.approximate).toBeFalsy();
          expect(zones?.disclaimer).toBeUndefined();

          // Nenhum rótulo do cálculo interno atravessou para o resultado.
          for (const item of zones?.items ?? []) {
            expect(COMPUTED_ZONE_LABELS).not.toContain(item.label);
          }

          // Guarda de não-vacuidade: com a MESMA atividade e o MESMO stream, a
          // fonte calculada era viável — logo a nativa realmente sobrepôs um
          // cálculo possível, e não um caminho morto.
          const computedAlternative = buildComputedHeartRateZonesSection(
            activity,
            samples,
          );
          expect(computedAlternative).not.toBeNull();
          expect(computedAlternative?.approximate).toBe(true);
          expect(zones?.items).not.toEqual(computedAlternative?.items);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("apenas com stream de FC, a seção surfaceada é a calculada, marcada como aproximada", async () => {
    await fc.assert(
      fc.asyncProperty(
        hybridProviderId,
        activityDataArb(resolvableHeartRateArb),
        heartRateSamplesArb,
        async (providerId, data, samples) => {
          const activity = makeActivity(providerId, data);

          registerHybridProvider(providerId, { nativeItems: null, samples });

          const result = await getActivityVisualData(activity);
          const zones = findZonesSection(result);

          expect(zones).toBeDefined();
          expect(zones?.approximate).toBe(true);
          expect(zones?.disclaimer).toBe(SYNTHETIC_ZONES_DISCLAIMER);

          // As 5 faixas por %FCmáx do cálculo compartilhado (Requisito 2.3).
          expect(zones?.items).toHaveLength(HEART_RATE_ZONE_COUNT);
          expect(zones?.items.map((item) => item.label)).toEqual(COMPUTED_ZONE_LABELS);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("sem fonte nativa e sem stream, nenhuma seção de zonas aparece — omissão graciosa, não erro", async () => {
    await fc.assert(
      fc.asyncProperty(
        hybridProviderId,
        activityDataArb(resolvableHeartRateArb),
        async (providerId, data) => {
          const activity = makeActivity(providerId, data);

          registerHybridProvider(providerId, { nativeItems: null, samples: null });

          const result = await getActivityVisualData(activity);

          expect(findZonesSection(result)).toBeUndefined();
          // Sem nenhuma fonte, o detalhe é a visão base normalizada (Requisito 2.6).
          expect(result).toEqual(buildBaseActivityVisualData(activity));
          expect(result.overviewMetrics.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("matriz completa de fontes: a seção existe se e somente se há fonte, e é aproximada se e somente se a fonte nativa está ausente", async () => {
    await fc.assert(
      fc.asyncProperty(
        hybridProviderId,
        sportTypeArb,
        startedAtArb,
        nativeZoneItemsArb,
        heartRateSamplesArb,
        fc.boolean(),
        fc.boolean(),
        // Terceiro eixo: existe ou não FC máxima de referência (Requisito 2.4).
        fc.boolean(),
        async (
          providerId,
          sportType,
          startedAt,
          nativeItems,
          samples,
          hasNativeSource,
          hasStreamSource,
          hasMaxHeartRateReference,
        ) => {
          const heartRate: ActivityHeartRate = hasMaxHeartRateReference
            ? { averageHeartRate: 140, maxHeartRate: 182 }
            : { averageHeartRate: null, maxHeartRate: null };

          const activity = makeActivity(providerId, {
            sportType,
            startedAt,
            durationSeconds: 3_600,
            distanceMeters: 10_000,
            ...heartRate,
          });

          registerHybridProvider(providerId, {
            nativeItems: hasNativeSource ? nativeItems : null,
            samples: hasStreamSource ? samples : null,
          });

          const result = await getActivityVisualData(activity);
          const zones = findZonesSection(result);

          const computedIsViable = hasStreamSource && hasMaxHeartRateReference;

          if (!hasNativeSource && !computedIsViable) {
            expect(zones).toBeUndefined();
            return;
          }

          expect(zones).toBeDefined();
          // O `id` é o mesmo nas duas origens: a UI não precisa saber qual foi
          // usada (Requisito 8.2).
          expect(zones?.id).toBe(HEART_RATE_ZONES_SECTION_ID);
          expect(zones?.items.length).toBeGreaterThan(0);

          if (hasNativeSource) {
            // Nativa vence sempre que existe, com ou sem stream disponível.
            expect(zones?.approximate).toBeFalsy();
            expect(zones?.disclaimer).toBeUndefined();
            expect(zones?.items).toEqual(nativeItems);
          } else {
            expect(zones?.approximate).toBe(true);
            expect(zones?.disclaimer).toBe(SYNTHETIC_ZONES_DISCLAIMER);
            expect(zones?.items).toHaveLength(HEART_RATE_ZONE_COUNT);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
