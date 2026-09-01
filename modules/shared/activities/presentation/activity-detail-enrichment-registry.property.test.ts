/**
 * Testes de propriedade da resolução de enriquecedores de detalhe de atividade.
 *
 * Feature: detalhe-atividade-multi-provider, Property 1: Enriquecimento é
 * resolvido por capability e registry, não por identidade do provider.
 * Feature: detalhe-atividade-multi-provider, Property 11: Qualquer provider
 * satisfazendo as capabilities relevantes funciona sem alteração do core.
 *
 * **Validates: Requirements 1.1, 1.2, 7.2**
 *
 * Estratégia: providers sintéticos existentes **apenas no contexto do teste**
 * (identificadores `FUTURE_*`, simulando Polar/COROS/Suunto/Fitbit ou qualquer
 * provider ainda não escrito) são injetados em dois pontos de lookup do core:
 *
 * - o registry (`ACTIVITY_DETAIL_ENRICHER_LOADERS`), restaurado ao estado
 *   original depois de cada teste;
 * - o resolver de capabilities (`setProviderCapabilitiesResolver`), que é como o
 *   catálogo publica capabilities em produção.
 *
 * Se qualquer um dos dois lookups dependesse da identidade do provider (uma
 * lista fechada de `ProviderId`, um `if (provider === "GARMIN")`), um provider
 * sintético nunca resolveria — e estes testes falhariam.
 *
 * A composição dos dois lookups dentro de `getActivityVisualData` (visão base
 * como fallback, enriquecedor que lança tratado como ausência de dado) é coberta
 * pelos testes das Properties 2 e 12; aqui o alvo é a resolução em si.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACTIVITY_DETAIL_ENRICHER_LOADERS,
  getActivityDetailEnricherLoader,
  type ActivityDetailEnricher,
  type ActivityDetailEnricherLoader,
} from "@/modules/shared/activities/presentation/activity-detail-enrichment-registry";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import {
  hasCapability,
  resetProviderCapabilitiesResolver,
  setProviderCapabilitiesResolver,
  type ProviderCapabilities,
} from "@/modules/shared/integrations/capabilities";
import type { ProviderId } from "@/modules/shared/integrations/types";

const NUM_RUNS = 200;

/** Entradas reais do registry, capturadas antes de qualquer injeção de teste. */
const SHIPPED_LOADERS: Partial<Record<ProviderId, ActivityDetailEnricherLoader>> = {
  ...ACTIVITY_DETAIL_ENRICHER_LOADERS,
};

/** Todos os `ProviderId` do catálogo atual (com e sem enriquecedor). */
const CATALOG_PROVIDER_IDS: readonly ProviderId[] = [
  "GARMIN",
  "STRAVA",
  "POLAR",
  "COROS",
  "SUUNTO",
  "FITBIT",
];

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const catalogProviderId: fc.Arbitrary<ProviderId> = fc.constantFrom(
  ...CATALOG_PROVIDER_IDS,
);

/**
 * Provider inexistente no catálogo, simulando um provider futuro. O cast é
 * deliberado: em produção o valor viria de `ProviderId` depois de o provider
 * entrar no catálogo — o core não deve se comportar de forma diferente por causa
 * do valor em si. O prefixo garante que o identificador sintético nunca colide
 * com um `ProviderId` real nem com chaves especiais de objeto (`__proto__`).
 */
const syntheticProviderId: fc.Arbitrary<ProviderId> = fc
  .string({ minLength: 1, maxLength: 8 })
  .map((suffix) => `FUTURE_${suffix}` as ProviderId);

const anyProviderId: fc.Arbitrary<ProviderId> = fc.oneof(
  catalogProviderId,
  syntheticProviderId,
);

/** Capabilities relevantes para o detalhe de atividade (Requisito 7.2). */
const detailCapabilities: fc.Arbitrary<ProviderCapabilities> = fc.record({
  activityDetails: fc.boolean(),
  streams: fc.boolean(),
  laps: fc.boolean(),
  heartRateZones: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Dublês e sandbox do registry
// ---------------------------------------------------------------------------

/** Visão enriquecida sintética, rastreável pela tag do provider que a produziu. */
function visualDataFor(tag: string): ActivityVisualData {
  return {
    sportLabel: "Corrida",
    sportKey: "run",
    provider: tag,
    startedAtLabel: "01/02/2026 07:40",
    heroStats: [{ label: "Duração", value: "00:45:00", tone: "primary" }],
    overviewMetrics: [{ label: "FC média", value: "142 bpm" }],
    barSections: [
      {
        id: `${tag}-hr-zones`,
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

interface FakeEnricherEntry {
  tag: string;
  enricher: ActivityDetailEnricher;
  loader: ActivityDetailEnricherLoader;
  /** Quantas vezes o loader foi acionado (o registry não deve acioná-lo). */
  loadCount: number;
}

function fakeEntry(tag: string): FakeEnricherEntry {
  const enricher: ActivityDetailEnricher = async () => visualDataFor(tag);
  const entry: FakeEnricherEntry = {
    tag,
    enricher,
    loader: async () => {
      entry.loadCount += 1;
      return enricher;
    },
    loadCount: 0,
  };

  return entry;
}

/**
 * Atividade sintética mínima: o enriquecedor fake não lê nenhum campo, então só
 * os campos que identificam origem/modalidade são preenchidos.
 */
function syntheticActivity(providerId: string): Activity {
  return {
    id: "activity-under-test",
    provider: providerId,
    sportType: "run",
  } as unknown as Activity;
}

/** Substitui todo o conteúdo do registry (limpa e reinsere). */
function replaceRegistry(
  entries: Partial<Record<ProviderId, ActivityDetailEnricherLoader>>,
): void {
  for (const key of Object.keys(ACTIVITY_DETAIL_ENRICHER_LOADERS) as ProviderId[]) {
    delete ACTIVITY_DETAIL_ENRICHER_LOADERS[key];
  }

  Object.assign(ACTIVITY_DETAIL_ENRICHER_LOADERS, entries);
}

afterEach(() => {
  replaceRegistry(SHIPPED_LOADERS);
  resetProviderCapabilitiesResolver();
});

// ---------------------------------------------------------------------------
// Property 1 — resolução por registry, não por identidade do provider
// ---------------------------------------------------------------------------

describe("getActivityDetailEnricherLoader (Property 1)", () => {
  it("resolve exatamente o loader registrado, para qualquer conjunto de ProviderIds", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(anyProviderId, { minLength: 1, maxLength: 6 }),
        fc.uniqueArray(anyProviderId, { maxLength: 6 }),
        (registeredIds, otherIds) => {
          const entries = new Map(
            registeredIds.map((id, index) => [id, fakeEntry(`provider-${index}`)]),
          );

          replaceRegistry(
            Object.fromEntries(
              [...entries].map(([id, entry]) => [id, entry.loader]),
            ) as Partial<Record<ProviderId, ActivityDetailEnricherLoader>>,
          );

          for (const [id, entry] of entries) {
            expect(getActivityDetailEnricherLoader(id)).toBe(entry.loader);
            // Lookup puro: resolver não carrega o módulo do provider.
            expect(entry.loadCount).toBe(0);
          }

          for (const id of otherIds) {
            if (entries.has(id)) {
              continue;
            }

            expect(getActivityDetailEnricherLoader(id)).toBeUndefined();
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("não depende de qual ProviderId é: o mesmo loader resolve igual sob qualquer identidade", () => {
    fc.assert(
      fc.property(anyProviderId, anyProviderId, (firstId, secondId) => {
        fc.pre(firstId !== secondId);

        const entry = fakeEntry("identity-agnostic");

        replaceRegistry({ [firstId]: entry.loader });
        expect(getActivityDetailEnricherLoader(firstId)).toBe(entry.loader);
        expect(getActivityDetailEnricherLoader(secondId)).toBeUndefined();

        // Mover a MESMA entrada para outro provider produz o mesmo resultado,
        // agora sob a outra identidade — a resolução acompanha o registro.
        replaceRegistry({ [secondId]: entry.loader });
        expect(getActivityDetailEnricherLoader(secondId)).toBe(entry.loader);
        expect(getActivityDetailEnricherLoader(firstId)).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("provider sem entrada no registry resolve undefined, sem lançar", () => {
    fc.assert(
      fc.property(anyProviderId, (id) => {
        replaceRegistry({});

        expect(() => getActivityDetailEnricherLoader(id)).not.toThrow();
        expect(getActivityDetailEnricherLoader(id)).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("preserva as entradas reais do registry: cada ProviderId do catálogo resolve sua própria entrada", () => {
    fc.assert(
      fc.property(catalogProviderId, (id) => {
        const resolved = getActivityDetailEnricherLoader(id);

        expect(resolved).toBe(SHIPPED_LOADERS[id]);
        expect(resolved === undefined || typeof resolved === "function").toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11 — provider futuro funciona sem alteração do core
// ---------------------------------------------------------------------------

describe("getActivityDetailEnricherLoader com provider sintético (Property 11)", () => {
  it("um provider registrado só em teste entrega enriquecimento pelo mesmo caminho de Garmin/Strava", async () => {
    await fc.assert(
      fc.asyncProperty(syntheticProviderId, async (futureProviderId) => {
        const entry = fakeEntry(futureProviderId);

        // Único ponto de contato do provider futuro com o core: uma entrada no
        // registry — as entradas existentes (GARMIN/STRAVA) nem são necessárias.
        replaceRegistry({ [futureProviderId]: entry.loader });

        const loader = getActivityDetailEnricherLoader(futureProviderId);
        expect(loader).toBeDefined();

        const enricher = await loader!();
        expect(enricher).toBe(entry.enricher);
        expect(entry.loadCount).toBe(1);

        const enriched = await enricher(syntheticActivity(futureProviderId));

        expect(enriched).toEqual(visualDataFor(futureProviderId));
        // O dado rico chega ao core sem que ele saiba de qual provider veio.
        expect(enriched?.barSections).toHaveLength(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("adicionar um provider futuro não altera a resolução dos providers já registrados", async () => {
    await fc.assert(
      fc.asyncProperty(syntheticProviderId, async (futureProviderId) => {
        fc.pre(SHIPPED_LOADERS[futureProviderId] === undefined);

        const entry = fakeEntry(futureProviderId);

        replaceRegistry({ ...SHIPPED_LOADERS, [futureProviderId]: entry.loader });

        for (const id of CATALOG_PROVIDER_IDS) {
          expect(getActivityDetailEnricherLoader(id)).toBe(SHIPPED_LOADERS[id]);
        }

        expect(await getActivityDetailEnricherLoader(futureProviderId)!()).toBe(
          entry.enricher,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("capability e registry são os dois únicos fatores: sem capability ou sem entrada, não há enriquecimento", () => {
    fc.assert(
      fc.property(
        anyProviderId,
        detailCapabilities,
        fc.boolean(),
        (providerId, capabilities, isRegistered) => {
          // O catálogo é a fonte das capabilities também para o provider
          // sintético: o core lê a declaração, nunca o identificador.
          setProviderCapabilitiesResolver((candidate) =>
            candidate === providerId ? capabilities : undefined,
          );

          const entry = fakeEntry("gated");
          replaceRegistry(isRegistered ? { [providerId]: entry.loader } : {});

          const canEnrich =
            hasCapability(providerId, "activityDetails") &&
            getActivityDetailEnricherLoader(providerId) !== undefined;

          expect(canEnrich).toBe(
            capabilities.activityDetails === true && isRegistered,
          );

          // Capabilities de dado (streams/laps/heartRateZones) também são lidas
          // do catálogo para o provider sintético, sem lista fechada no core.
          expect(hasCapability(providerId, "streams")).toBe(
            capabilities.streams === true,
          );
          expect(hasCapability(providerId, "laps")).toBe(capabilities.laps === true);
          expect(hasCapability(providerId, "heartRateZones")).toBe(
            capabilities.heartRateZones === true,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
