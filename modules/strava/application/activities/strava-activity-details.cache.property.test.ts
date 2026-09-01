/**
 * Testes de propriedade do cache em memória do enriquecimento de detalhe do
 * Strava (Tarefa 16.3).
 *
 * Feature: detalhe-atividade-multi-provider, Property 16: Cache de
 * enriquecimento evita buscas repetidas para a mesma atividade.
 *
 * **Validates: Requirements 10.4**
 *
 * Estratégia: `getStravaActivityVisualData` aceita injeção de `client` e de
 * `now`, então o teste controla as duas únicas variáveis que decidem um acerto de
 * cache — quantas chamadas reais o client recebe e onde o relógio está em
 * relação ao TTL — sem `vi.useFakeTimers` e sem rede.
 *
 * O client injetado é um dublê que CONTA as chamadas a `getActivityStreams` e
 * `getActivityLaps` e devolve payloads validados pelos schemas reais
 * (`stravaStreamSetObjectSchema` / `stravaLapListSchema`), de forma que os
 * parsers de produção percorram a mesma forma de dado da API. Nenhuma parte do
 * enriquecimento é mockada: apenas a borda de rede.
 *
 * Três dimensões da chave/TTL são cobertas:
 *
 * 1. mesma atividade (mesmo `id` + `updatedAt`) dentro do TTL → exatamente UMA
 *    busca por fonte, independentemente de quantas vezes a função é chamada;
 * 2. `updatedAt` diferente (atividade reprocessada) → entrada nova, busca nova,
 *    sem invalidação explícita;
 * 3. relógio além do TTL → refetch.
 *
 * `id` diferente também é coberto, para garantir que a chave não colapsa
 * atividades distintas em uma única entrada.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StravaClient } from "@/modules/strava/api/client";
import type { StravaLapDto } from "@/modules/strava/api/dto/strava-lap";
import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";
import { stravaLapListSchema } from "@/modules/strava/api/schemas/strava-lap";
import { stravaStreamSetObjectSchema } from "@/modules/strava/api/schemas/strava-stream";
import {
  STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS,
  getStravaActivityVisualData,
  stravaActivityVisualCache,
} from "@/modules/strava/application/activities/strava-activity-details";

const NUM_RUNS = 100;

/** Instante base do relógio injetado (valor arbitrário, só a diferença importa). */
const CLOCK_BASE_MS = Date.UTC(2026, 1, 1, 7, 40, 0);

// ---------------------------------------------------------------------------
// Payloads do provider (validados pelos schemas reais)
// ---------------------------------------------------------------------------

/**
 * Conteúdo bruto que o dublê de client devolve. `"rich"` produz seções
 * (stream de FC + laps); `"empty"` produz ausência total de dado rico, caminho em
 * que o enriquecedor devolve `null` — que TAMBÉM é cacheado (repetir a busca a
 * cada render sem dado só queimaria cota).
 */
interface ProviderPayload {
  kind: "rich" | "empty";
  streams: StravaStreamSetObjectDto;
  laps: StravaLapDto[];
}

function numberStream(data: readonly number[], seriesType: "time" | "distance") {
  return {
    type: "generic",
    data: [...data],
    series_type: seriesType,
    original_size: data.length,
    resolution: "high",
  };
}

function richPayload(heartRates: readonly number[], lapCount: number): ProviderPayload {
  return {
    kind: "rich",
    streams: stravaStreamSetObjectSchema.parse({
      time: numberStream(
        heartRates.map((_, index) => index * 10),
        "time",
      ),
      heartrate: numberStream(heartRates, "time"),
    }),
    laps: stravaLapListSchema.parse(
      Array.from({ length: lapCount }, (_, index) => ({
        id: index + 1,
        lap_index: index + 1,
        elapsed_time: 300 + index * 5,
        moving_time: 295 + index * 5,
        distance: 1000 + index * 10,
        average_speed: 3.2 + index * 0.1,
        average_heartrate: 140 + index,
        average_cadence: 84 + index,
      })),
    ),
  };
}

const EMPTY_PAYLOAD: ProviderPayload = {
  kind: "empty",
  streams: stravaStreamSetObjectSchema.parse({}),
  laps: stravaLapListSchema.parse([]),
};

const payloadArb: fc.Arbitrary<ProviderPayload> = fc.oneof(
  fc
    .record({
      heartRates: fc.array(fc.integer({ min: 90, max: 190 }), {
        minLength: 3,
        maxLength: 24,
      }),
      lapCount: fc.integer({ min: 1, max: 5 }),
    })
    .map(({ heartRates, lapCount }) => richPayload(heartRates, lapCount)),
  fc.constant(EMPTY_PAYLOAD),
);

// ---------------------------------------------------------------------------
// Dublê de client que conta as chamadas
// ---------------------------------------------------------------------------

interface CountingStravaClient {
  /** Passado como `options.client`; nunca toca a rede. */
  client: StravaClient;
  /** `externalId` de cada chamada a `getActivityStreams`, na ordem. */
  streamsCalls: string[];
  /** `externalId` de cada chamada a `getActivityLaps`, na ordem. */
  lapsCalls: string[];
}

/**
 * Client mínimo com apenas os dois métodos que o enriquecimento de detalhe usa.
 * O cast é deliberado: `StravaClient` é uma classe com muito mais superfície, e
 * qualquer método além destes dois sendo chamado seria um erro em si.
 */
function countingClient(payload: ProviderPayload): CountingStravaClient {
  const streamsCalls: string[] = [];
  const lapsCalls: string[] = [];

  const client = {
    getActivityStreams: async (_ctx: unknown, id: string | number) => {
      streamsCalls.push(String(id));
      return payload.streams;
    },
    getActivityLaps: async (_ctx: unknown, id: string | number) => {
      lapsCalls.push(String(id));
      return payload.laps;
    },
  } as unknown as StravaClient;

  return { client, streamsCalls, lapsCalls };
}

// ---------------------------------------------------------------------------
// Atividade sintética
// ---------------------------------------------------------------------------

interface ActivityKey {
  id: string;
  updatedAt: Date;
}

/**
 * Atividade persistida do Strava. `maxHeartRate` é preenchido porque sem FC
 * máxima de referência as zonas calculadas são omitidas — e o alvo aqui é o
 * cache, não a omissão graciosa (coberta pelas Properties 9/13).
 */
function makeActivity(args: {
  key: ActivityKey;
  sportType: string;
  externalId: string;
}): Activity {
  return {
    id: args.key.id,
    userId: "user-under-test",
    wearableConnectionId: "connection-under-test",
    externalId: args.externalId,
    provider: "STRAVA",
    providerSportType: null,
    sportType: args.sportType,
    name: null,
    startedAt: new Date("2026-02-01T07:40:00.000Z"),
    endedAt: null,
    durationSeconds: 2_700,
    movingSeconds: null,
    distanceMeters: 10_000,
    calories: 620,
    averageHeartRate: 148,
    maxHeartRate: 186,
    averagePace: 270,
    averageSpeed: 3.7,
    maxSpeed: 4.4,
    elevationGain: 120,
    averageCadence: 86,
    averagePower: null,
    maxPower: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: args.key.updatedAt,
  } as unknown as Activity;
}

/** Modalidades canônicas: todas as categorias admitem análise do treino. */
const sportTypeArb: fc.Arbitrary<string> = fc.constantFrom(
  "run",
  "bike",
  "swim",
  "rowing",
  "gym",
);

const activityIdArb: fc.Arbitrary<string> = fc
  .uuid()
  .map((value) => `activity-${value}`);

const updatedAtArb: fc.Arbitrary<Date> = fc.date({
  min: new Date("2020-01-01T00:00:00.000Z"),
  max: new Date("2035-12-31T23:59:59.000Z"),
  noInvalidDate: true,
});

const activityKeyArb: fc.Arbitrary<ActivityKey> = fc.record({
  id: activityIdArb,
  updatedAt: updatedAtArb,
});

/**
 * Deslocamentos do relógio (ms) para as chamadas subsequentes, todos DENTRO do
 * TTL e monotônicos: o relógio de produção não anda para trás.
 */
const withinTtlOffsetsArb: fc.Arbitrary<number[]> = fc
  .array(fc.integer({ min: 0, max: STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS - 1 }), {
    minLength: 1,
    maxLength: 7,
  })
  .map((offsets) => [...offsets].sort((left, right) => left - right));

// ---------------------------------------------------------------------------
// Relógio injetável
// ---------------------------------------------------------------------------

/** Relógio controlado pelo teste: `set` posiciona o instante da próxima chamada. */
function controlledClock(): { now: () => number; set: (value: number) => void } {
  let current = CLOCK_BASE_MS;

  return {
    now: () => current,
    set: (value: number) => {
      current = value;
    },
  };
}

// ---------------------------------------------------------------------------
// Isolamento
// ---------------------------------------------------------------------------

/**
 * O cache é um `Map` de módulo: sem limpeza, uma execução do fast-check herdaria
 * entradas da anterior. Cada predicado limpa antes de começar.
 */
function resetCache(): void {
  stravaActivityVisualCache.clear();
}

beforeEach(resetCache);

/**
 * O enriquecimento emite logs estruturados por chamada; com ~100 execuções isso
 * inundaria a saída do teste sem agregar informação. Os logs em si são cobertos
 * pelos testes de observabilidade.
 */
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeAll(() => {
  consoleSpies.push(
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
  );
});

afterAll(() => {
  for (const spy of consoleSpies) {
    spy.mockRestore();
  }

  resetCache();
});

// ---------------------------------------------------------------------------
// Property 16 — uma única busca por atividade dentro do TTL
// ---------------------------------------------------------------------------

describe("getStravaActivityVisualData com cache em memória (Property 16)", () => {
  it("N chamadas para a mesma atividade dentro do TTL fazem exatamente UMA busca de streams e UMA de laps", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityKeyArb,
        sportTypeArb,
        payloadArb,
        withinTtlOffsetsArb,
        async (key, sportType, payload, offsets) => {
          resetCache();

          const activity = makeActivity({
            key,
            sportType,
            externalId: "strava-activity-1",
          });
          const provider = countingClient(payload);
          const clock = controlledClock();

          const first = await getStravaActivityVisualData(activity, {
            client: provider.client,
            now: clock.now,
          });

          // Guarda de vacuidade: o caminho de busca foi realmente exercitado.
          expect(provider.streamsCalls).toEqual(["strava-activity-1"]);
          expect(provider.lapsCalls).toEqual(["strava-activity-1"]);

          if (payload.kind === "rich") {
            expect(first).not.toBeNull();
            expect(first?.barSections.length).toBeGreaterThan(0);
          } else {
            expect(first).toBeNull();
          }

          for (const offset of offsets) {
            clock.set(CLOCK_BASE_MS + offset);

            const repeated = await getStravaActivityVisualData(activity, {
              client: provider.client,
              now: clock.now,
            });

            // Identidade referencial: o valor veio do cache, não de uma
            // recomposição (que produziria um objeto equivalente, mas novo).
            expect(repeated).toBe(first);
          }

          // O ponto da propriedade: a contagem de buscas não acompanha a
          // contagem de chamadas.
          expect(provider.streamsCalls).toHaveLength(1);
          expect(provider.lapsCalls).toHaveLength(1);
          expect(stravaActivityVisualCache.size).toBe(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("atividade reprocessada (updatedAt diferente) gera entrada nova e busca nova, sem invalidar a anterior", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityKeyArb,
        sportTypeArb,
        payloadArb,
        // Qualquer avanço positivo do `updatedAt` muda a chave.
        fc.integer({ min: 1, max: 90 * 24 * 60 * 60 * 1000 }),
        fc.integer({ min: 0, max: STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS - 1 }),
        async (key, sportType, payload, updatedAtDeltaMs, offset) => {
          resetCache();

          const provider = countingClient(payload);
          const clock = controlledClock();
          const call = (activity: Activity) =>
            getStravaActivityVisualData(activity, {
              client: provider.client,
              now: clock.now,
            });

          const original = makeActivity({
            key,
            sportType,
            externalId: "strava-activity-1",
          });
          const reprocessed = makeActivity({
            key: {
              id: key.id,
              updatedAt: new Date(key.updatedAt.getTime() + updatedAtDeltaMs),
            },
            sportType,
            externalId: "strava-activity-1",
          });

          const first = await call(original);
          clock.set(CLOCK_BASE_MS + offset);

          const afterUpdate = await call(reprocessed);

          // Chave nova ⇒ busca nova, mesmo dentro do TTL da entrada anterior.
          expect(provider.streamsCalls).toHaveLength(2);
          expect(provider.lapsCalls).toHaveLength(2);
          expect(stravaActivityVisualCache.size).toBe(2);
          expect(afterUpdate).toEqual(first);
          if (payload.kind === "rich") {
            // Mesmo conteúdo, objeto novo: houve recomposição, não acerto.
            expect(afterUpdate).not.toBe(first);
          }

          // E a entrada anterior continua válida: nada foi invalidado.
          expect(await call(original)).toBe(first);
          expect(await call(reprocessed)).toBe(afterUpdate);
          expect(provider.streamsCalls).toHaveLength(2);
          expect(provider.lapsCalls).toHaveLength(2);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("passado o TTL, a busca é refeita e o resultado volta a ser cacheado", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityKeyArb,
        sportTypeArb,
        payloadArb,
        // A partir do TTL exato a entrada já expirou (`expiresAt > now` falha).
        fc.integer({
          min: STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS,
          max: STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS * 4,
        }),
        fc.integer({ min: 0, max: STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS - 1 }),
        async (key, sportType, payload, expiredOffset, freshOffset) => {
          resetCache();

          const activity = makeActivity({
            key,
            sportType,
            externalId: "strava-activity-1",
          });
          const provider = countingClient(payload);
          const clock = controlledClock();
          const call = () =>
            getStravaActivityVisualData(activity, {
              client: provider.client,
              now: clock.now,
            });

          const first = await call();

          clock.set(CLOCK_BASE_MS + expiredOffset);
          const refetched = await call();

          expect(provider.streamsCalls).toHaveLength(2);
          expect(provider.lapsCalls).toHaveLength(2);
          // Mesmo conteúdo, objeto novo: veio de uma recomposição real.
          expect(refetched).toEqual(first);
          if (payload.kind === "rich") {
            expect(refetched).not.toBe(first);
          }

          // A entrada renovada volta a servir de cache dentro do novo TTL.
          clock.set(CLOCK_BASE_MS + expiredOffset + freshOffset);
          expect(await call()).toBe(refetched);
          expect(provider.streamsCalls).toHaveLength(2);
          expect(provider.lapsCalls).toHaveLength(2);
          expect(stravaActivityVisualCache.size).toBe(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("atividades distintas não compartilham entrada: cada id busca uma vez e mantém seu próprio valor", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(activityIdArb, { minLength: 2, maxLength: 2 }),
        updatedAtArb,
        sportTypeArb,
        payloadArb,
        async ([firstId, secondId], updatedAt, sportType, payload) => {
          resetCache();

          const provider = countingClient(payload);
          const clock = controlledClock();
          const call = (id: string, externalId: string) =>
            getStravaActivityVisualData(
              makeActivity({ key: { id, updatedAt }, sportType, externalId }),
              { client: provider.client, now: clock.now },
            );

          const first = await call(firstId, "strava-activity-1");
          const second = await call(secondId, "strava-activity-2");

          expect(provider.streamsCalls).toEqual([
            "strava-activity-1",
            "strava-activity-2",
          ]);
          expect(provider.lapsCalls).toEqual([
            "strava-activity-1",
            "strava-activity-2",
          ]);
          expect(stravaActivityVisualCache.size).toBe(2);

          // Repetir qualquer uma delas dentro do TTL não gera busca nova.
          expect(await call(firstId, "strava-activity-1")).toBe(first);
          expect(await call(secondId, "strava-activity-2")).toBe(second);
          expect(provider.streamsCalls).toHaveLength(2);
          expect(provider.lapsCalls).toHaveLength(2);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
