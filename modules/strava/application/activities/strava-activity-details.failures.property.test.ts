/**
 * Teste de propriedade da tolerância a falha do enriquecimento de detalhe do
 * Strava (Tarefa 16.2).
 *
 * Feature: detalhe-atividade-multi-provider, Property 13: Falhas de
 * rede/validação em streams ou laps do Strava nunca propagam para o
 * enriquecimento — para qualquer tipo de falha simulada
 * (401/403/404/429/5xx/timeout/JSON inválido/payload que falha na validação
 * Zod) ocorrendo na busca de streams OU de laps,
 * `getStravaActivityVisualData` trata a falha como ausência do dado
 * correspondente (omitindo o bloco relacionado) e retorna normalmente, nunca
 * propagando a exceção.
 *
 * **Validates: Requirements 9.4**
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - O `StravaClient` é injetado por `options.client`: um dublê que implementa
 *   apenas `getActivityStreams`/`getActivityLaps` (os dois únicos métodos que o
 *   enriquecedor usa). Nenhuma rede, nenhum banco, nenhum cofre de secrets.
 * - Os erros lançados pelo dublê são os MESMOS tipos que o client real produz
 *   (`StravaAuthError`, `StravaRateLimitExceededError` e `StravaClientError`
 *   com os `code` reais de timeout/rede/JSON inválido/validação Zod), mais
 *   falhas atípicas (erro não tipado, rejeição com valor que não é `Error`,
 *   throw sincrônico e payload malformado que "escapou" da validação) — a
 *   propriedade fala de robustez, então o espaço de falha inclui o inesperado.
 * - `stravaActivityVisualCache` é limpo antes de CADA caso gerado: um resultado
 *   cacheado de um caso anterior mascararia o cenário sob teste.
 * - Os logs estruturados (`logIntegrationEvent`) são silenciados: o alvo aqui é
 *   o valor de retorno, e centenas de linhas de log poluiriam a saída.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HEART_RATE_ZONES_SECTION_ID } from "@/modules/shared/activities/heart-rate-zones";
import type {
  ActivityMetricSection,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";
import type { StravaClient } from "@/modules/strava/api/client";
import {
  StravaAuthError,
  StravaClientError,
  StravaRateLimitExceededError,
} from "@/modules/strava/api/client";
import type {
  StravaLapDto,
  StravaStreamSetObjectDto,
} from "@/modules/strava/api/dto";
import {
  stravaLapListSchema,
  stravaStreamSetObjectSchema,
} from "@/modules/strava/api/schemas";
import {
  STRAVA_SPLITS_SECTION_ID,
  STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
  getStravaActivityVisualData,
  stravaActivityVisualCache,
} from "@/modules/strava/application/activities/strava-activity-details";
import { buildLapList } from "@/modules/strava/tests/fixtures/activity-laps";
import { buildStreamSet } from "@/modules/strava/tests/fixtures/activity-streams";

const NUM_RUNS = 120;

const CONNECTION_ID = "connection-under-test";

// ---------------------------------------------------------------------------
// Payloads de SUCESSO (validados pelos schemas reais)
// ---------------------------------------------------------------------------

/**
 * `StreamSet` de sucesso, passado pelo schema real do client — o dublê devolve
 * exatamente o que `getActivityStreams` devolveria. Contém `time` + `heartrate`
 * (base das zonas calculadas) e cadência/distância/velocidade.
 */
const SUCCESS_STREAM_SET: StravaStreamSetObjectDto =
  stravaStreamSetObjectSchema.parse(buildStreamSet());

/** Lista de laps de sucesso (3 voltas com métricas), validada pelo schema real. */
const SUCCESS_LAP_LIST: StravaLapDto[] = stravaLapListSchema.parse(buildLapList());

// ---------------------------------------------------------------------------
// Espaço de falha
// ---------------------------------------------------------------------------

/**
 * Como uma das duas buscas pode falhar. Cobre o enunciado do Requisito 9.4
 * (401/403/404/429/5xx/timeout/payload que falha na validação Zod) e ainda
 * falhas atípicas, que também não podem escapar.
 */
type FailureMode =
  | "unauthorized-401"
  | "forbidden-403"
  | "not-found-404"
  | "rate-limited-429"
  | "server-error-500"
  | "server-error-502"
  | "server-error-503"
  | "timeout"
  | "network-error"
  | "invalid-json"
  | "invalid-response-zod"
  | "untyped-error"
  | "non-error-rejection"
  | "malformed-payload";

const FAILURE_MODES: readonly FailureMode[] = [
  "unauthorized-401",
  "forbidden-403",
  "not-found-404",
  "rate-limited-429",
  "server-error-500",
  "server-error-502",
  "server-error-503",
  "timeout",
  "network-error",
  "invalid-json",
  "invalid-response-zod",
  "untyped-error",
  "non-error-rejection",
  "malformed-payload",
];

/** Status HTTP dos modos que o client real reporta como `STRAVA_HTTP_ERROR`. */
const HTTP_ERROR_STATUS: Partial<Record<FailureMode, number>> = {
  "forbidden-403": 403,
  "not-found-404": 404,
  "server-error-500": 500,
  "server-error-502": 502,
  "server-error-503": 503,
};

/**
 * Payloads MALFORMADOS que jamais passariam pela validação Zod do client — o
 * modo `"malformed-payload"` simula a hipótese pessimista de um payload inválido
 * chegando ao parser (streams na forma de array, laps na forma de objeto). Nem
 * um erro de parser pode virar erro de página.
 */
const MALFORMED_STREAM_PAYLOAD = [
  { type: "heartrate", data: [120, 130] },
] as unknown as StravaStreamSetObjectDto;

const MALFORMED_LAP_PAYLOAD = {
  laps: [{ id: 1 }],
} as unknown as StravaLapDto[];

/**
 * Erro correspondente ao modo, com os mesmos tipos/códigos que o client real
 * produz para cada desfecho.
 */
function failureFor(mode: FailureMode, operation: string): unknown {
  const httpStatus = HTTP_ERROR_STATUS[mode];

  if (httpStatus !== undefined) {
    return new StravaClientError({
      code: "STRAVA_HTTP_ERROR",
      message: `Strava respondeu ${httpStatus}.`,
      httpStatus,
      connectionId: CONNECTION_ID,
      operation,
    });
  }

  switch (mode) {
    case "unauthorized-401":
      return new StravaAuthError({
        message: "Strava respondeu 401 mesmo após refresh e retry.",
        connectionId: CONNECTION_ID,
        operation,
      });
    case "rate-limited-429":
      return new StravaRateLimitExceededError({
        retryAfterMs: 900_000,
        connectionId: CONNECTION_ID,
        operation,
      });
    case "timeout":
      return new StravaClientError({
        code: "STRAVA_CLIENT_TIMEOUT",
        message: "Timeout na requisição ao Strava.",
        connectionId: CONNECTION_ID,
        operation,
      });
    case "network-error":
      return new StravaClientError({
        code: "STRAVA_CLIENT_NETWORK_ERROR",
        message: "Falha de rede ao chamar o Strava.",
        connectionId: CONNECTION_ID,
        operation,
      });
    case "invalid-json":
      return new StravaClientError({
        code: "STRAVA_INVALID_JSON",
        message: "Resposta do Strava não é JSON válido.",
        httpStatus: 200,
        connectionId: CONNECTION_ID,
        operation,
      });
    case "invalid-response-zod":
      return new StravaClientError({
        code: "STRAVA_INVALID_RESPONSE",
        message: "Resposta do Strava não passou na validação de schema.",
        httpStatus: 200,
        connectionId: CONNECTION_ID,
        operation,
      });
    case "non-error-rejection":
      // Rejeição com valor que não é `Error` (o `catch` não pode assumir tipo).
      return "falha sem Error";
    default:
      return new Error("falha inesperada na busca do Strava");
  }
}

/** Plano de falha do caso: `null` significa "esta busca teve sucesso". */
interface FailurePlan {
  streams: FailureMode | null;
  laps: FailureMode | null;
  /** Se o dublê lança de forma SINCRÔNICA em vez de rejeitar a promise. */
  throwSynchronously: boolean;
}

interface FakeClient {
  client: StravaClient;
  calls: { streams: number; laps: number };
}

/**
 * Dublê do `StravaClient` com apenas os dois métodos consumidos pelo
 * enriquecedor. Métodos declarados como funções NÃO-async de propósito: com
 * `throwSynchronously`, a exceção acontece antes de qualquer promise existir —
 * caminho que um `catch` mal posicionado deixaria escapar.
 */
function makeFakeClient(plan: FailurePlan): FakeClient {
  const calls = { streams: 0, laps: 0 };

  const respond = <T>(
    mode: FailureMode | null,
    success: T,
    malformed: T,
    operation: string,
  ): Promise<T> => {
    if (mode === null) {
      return Promise.resolve(success);
    }

    if (mode === "malformed-payload") {
      return Promise.resolve(malformed);
    }

    const failure = failureFor(mode, operation);

    if (plan.throwSynchronously) {
      throw failure;
    }

    return Promise.reject(failure);
  };

  const client = {
    getActivityStreams: (): Promise<StravaStreamSetObjectDto> => {
      calls.streams += 1;
      return respond(
        plan.streams,
        SUCCESS_STREAM_SET,
        MALFORMED_STREAM_PAYLOAD,
        "get_activity_streams",
      );
    },
    getActivityLaps: (): Promise<StravaLapDto[]> => {
      calls.laps += 1;
      return respond(
        plan.laps,
        SUCCESS_LAP_LIST,
        MALFORMED_LAP_PAYLOAD,
        "get_activity_laps",
      );
    },
  } as unknown as StravaClient;

  return { client, calls };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const failureMode: fc.Arbitrary<FailureMode> = fc.constantFrom(...FAILURE_MODES);

/**
 * Combinações em que ao menos UMA das duas buscas falha (o caso "as duas
 * funcionam" é a guarda de vacuidade, testada à parte). Modelado por
 * construção, sem `fc.pre`, para não descartar casos gerados.
 */
const failurePlanWithFailure: fc.Arbitrary<FailurePlan> = fc
  .tuple(
    fc.oneof(
      fc.record({ streams: failureMode, laps: fc.constant(null) }),
      fc.record({ streams: fc.constant(null), laps: failureMode }),
      fc.record({ streams: failureMode, laps: failureMode }),
    ),
    fc.boolean(),
  )
  .map(([modes, throwSynchronously]) => ({ ...modes, throwSynchronously }));

/**
 * `sportType` cru persistido: qualquer modalidade canônica ou um valor legado /
 * desconhecido (que cai na categoria `"default"`). A tolerância a falha não pode
 * depender da modalidade.
 */
const sportTypeArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...RYVANO_SPORT_TYPES),
  fc.constantFrom("lap_swimming", "SPORT_DO_FUTURO", "", "Kite Boarding"),
);

const optionalInt = (min: number, max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.integer({ min, max }), { nil: null });

const optionalFloat = (min: number, max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.double({ min, max, noNaN: true }), { nil: null });

interface ActivityData {
  sportType: string;
  startedAt: Date;
  updatedAt: Date;
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number;
  averagePace: number | null;
  averageSpeed: number | null;
  elevationGain: number | null;
  averageCadence: number | null;
  averagePower: number | null;
}

/**
 * Atividade do Strava com FC máxima SEMPRE presente e acima da FC média: é a
 * condição do Requisito 2.4-a para as zonas calculadas existirem. Fixá-la é o
 * que dá poder ao teste — sem ela, "sem seção de zonas" seria ambíguo entre
 * "streams falharam" e "faltou FC de referência".
 */
const activityDataArb: fc.Arbitrary<ActivityData> = fc.record({
  sportType: sportTypeArb,
  startedAt: fc.date({
    min: new Date("2020-01-01T00:00:00.000Z"),
    max: new Date("2030-12-31T23:59:59.000Z"),
    noInvalidDate: true,
  }),
  updatedAt: fc.date({
    min: new Date("2020-01-01T00:00:00.000Z"),
    max: new Date("2030-12-31T23:59:59.000Z"),
    noInvalidDate: true,
  }),
  durationSeconds: optionalInt(0, 86_400),
  distanceMeters: optionalFloat(0, 300_000),
  calories: optionalInt(0, 10_000),
  averageHeartRate: optionalInt(60, 140),
  maxHeartRate: fc.integer({ min: 150, max: 220 }),
  averagePace: optionalFloat(45, 1_800),
  averageSpeed: optionalFloat(0, 30),
  elevationGain: optionalFloat(0, 5_000),
  averageCadence: optionalFloat(0, 220),
  averagePower: optionalFloat(0, 1_500),
});

function makeActivity(data: ActivityData): Activity {
  return {
    id: "activity-under-test",
    userId: "user-under-test",
    wearableConnectionId: CONNECTION_ID,
    externalId: "9000000001",
    provider: "STRAVA",
    providerSportType: null,
    name: null,
    endedAt: null,
    movingSeconds: null,
    timezone: null,
    maxSpeed: null,
    maxPower: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...data,
  } as unknown as Activity;
}

const activityArb: fc.Arbitrary<Activity> = activityDataArb.map(makeActivity);

// ---------------------------------------------------------------------------
// Leitura das seções produzidas
// ---------------------------------------------------------------------------

/** Seção de barras das zonas de FC calculadas (fonte: stream de FC). */
function heartRateZonesSection(view: ActivityVisualData | null) {
  return (
    view?.barSections.find((section) => section.id === HEART_RATE_ZONES_SECTION_ID) ??
    null
  );
}

/** Seção de barras de splits/voltas (fonte: laps). */
function splitsSection(view: ActivityVisualData | null) {
  return (
    view?.barSections.find((section) => section.id === STRAVA_SPLITS_SECTION_ID) ??
    null
  );
}

/** Seção de análise do treino (fontes: zonas + laps + streams). */
function workoutAnalysisSection(
  view: ActivityVisualData | null,
): ActivityMetricSection | null {
  return (
    view?.metricSections.find(
      (section) => section.id === STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
    ) ?? null
  );
}

/** Rótulos de linha da análise do treino que só existem a partir dos STREAMS. */
const STREAM_DERIVED_ROW_LABELS = new Set<string>([
  "Tempo em zonas leves",
  "Tempo em zona moderada",
  "Tempo em zonas intensas",
  "FC ao longo do treino",
  "Cadência ao longo do treino",
  "Frequência de braçadas ao longo do treino",
  "Velocidade ao longo do treino",
]);

/**
 * Linhas derivadas dos LAPS: todas nomeiam splits/voltas ("Splits registrados",
 * "Variação de ritmo entre voltas", ...). Nenhuma linha de stream usa esses
 * termos, então o critério separa as duas origens sem ambiguidade.
 */
function isLapDerivedRow(label: string): boolean {
  return /splits|voltas/i.test(label);
}

function rowLabels(section: ActivityMetricSection | null): string[] {
  return (section?.metrics ?? []).map((row) => row.label);
}

/** Checagem estrutural mínima da visão devolvida (quando não é `null`). */
function expectStructurallyValid(view: ActivityVisualData): void {
  expect(view.provider).toBe("STRAVA");
  expect(typeof view.sportKey).toBe("string");
  expect(view.sportKey.length).toBeGreaterThan(0);
  expect(Array.isArray(view.heroStats)).toBe(true);
  expect(Array.isArray(view.overviewMetrics)).toBe(true);
  expect(Array.isArray(view.barSections)).toBe(true);
  expect(Array.isArray(view.metricSections)).toBe(true);
  // Uma visão enriquecida nunca é devolvida sem nenhuma seção rica.
  expect(view.barSections.length + view.metricSections.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

beforeEach(() => {
  stravaActivityVisualCache.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  stravaActivityVisualCache.clear();
});

// ---------------------------------------------------------------------------
// Property 13
// ---------------------------------------------------------------------------

describe("getStravaActivityVisualData com falha em streams/laps (Property 13)", () => {
  it("nunca lança e omite apenas o bloco da fonte que falhou, para qualquer combinação de falhas", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityArb,
        failurePlanWithFailure,
        async (activity, plan) => {
          // Cache limpo por CASO: um resultado anterior mascararia o cenário.
          stravaActivityVisualCache.clear();

          const { client, calls } = makeFakeClient(plan);

          const view = await getStravaActivityVisualData(activity, { client });

          // As duas buscas foram de fato tentadas (capabilities `streams`/`laps`
          // declaradas no catálogo) — o caminho de falha foi exercitado.
          expect(calls).toEqual({ streams: 1, laps: 1 });

          const analysis = workoutAnalysisSection(view);
          const labels = rowLabels(analysis);

          if (plan.streams !== null) {
            // Falha em streams: nenhuma zona de FC e nenhuma linha de série.
            expect(heartRateZonesSection(view)).toBeNull();
            expect(labels.filter((label) => STREAM_DERIVED_ROW_LABELS.has(label))).toEqual([]);
          } else {
            // Fonte que sobreviveu continua contribuindo normalmente.
            expect(heartRateZonesSection(view)).not.toBeNull();
            expect(labels.some((label) => STREAM_DERIVED_ROW_LABELS.has(label))).toBe(true);
          }

          if (plan.laps !== null) {
            // Falha em laps: nenhuma barra de split e nenhuma linha de split.
            expect(splitsSection(view)).toBeNull();
            expect(labels.filter(isLapDerivedRow)).toEqual([]);
          } else {
            expect(splitsSection(view)).not.toBeNull();
            expect(labels.some(isLapDerivedRow)).toBe(true);
          }

          if (plan.streams !== null && plan.laps !== null) {
            // Nenhuma fonte disponível: `null` é a omissão graciosa correta (o
            // dispatcher exibe a visão base). Nunca uma exceção.
            expect(view).toBeNull();
          } else {
            expect(view).not.toBeNull();
            expectStructurallyValid(view as ActivityVisualData);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("falha nas duas buscas devolve null para qualquer par de tipos de erro, sem lançar", async () => {
    await fc.assert(
      fc.asyncProperty(
        activityArb,
        failureMode,
        failureMode,
        fc.boolean(),
        async (activity, streams, laps, throwSynchronously) => {
          stravaActivityVisualCache.clear();

          const { client, calls } = makeFakeClient({
            streams,
            laps,
            throwSynchronously,
          });

          await expect(
            getStravaActivityVisualData(activity, { client }),
          ).resolves.toBeNull();

          expect(calls).toEqual({ streams: 1, laps: 1 });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("guarda de vacuidade: com as duas buscas bem-sucedidas, as seções ricas SÃO produzidas", async () => {
    await fc.assert(
      fc.asyncProperty(activityArb, async (activity) => {
        stravaActivityVisualCache.clear();

        const { client, calls } = makeFakeClient({
          streams: null,
          laps: null,
          throwSynchronously: false,
        });

        const view = await getStravaActivityVisualData(activity, { client });

        expect(calls).toEqual({ streams: 1, laps: 1 });
        expect(view).not.toBeNull();
        expectStructurallyValid(view as ActivityVisualData);

        const zones = heartRateZonesSection(view);
        const splits = splitsSection(view);
        const analysis = workoutAnalysisSection(view);
        const labels = rowLabels(analysis);

        expect(zones?.items.length).toBeGreaterThan(0);
        expect(zones?.approximate).toBe(true);
        expect(splits?.items.length).toBeGreaterThan(0);
        expect(analysis).not.toBeNull();
        // As duas origens de linha estão representadas na análise do treino.
        expect(labels.some((label) => STREAM_DERIVED_ROW_LABELS.has(label))).toBe(true);
        expect(labels.some(isLapDerivedRow)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
