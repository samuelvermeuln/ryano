/**
 * Teste de integração END-TO-END do dispatcher provider-agnostic com o
 * enriquecedor REAL do Strava (Tarefa 19.2).
 *
 * _Requisitos: 1.1, 1.2, 7.1_
 *
 * ── O que este teste cobre que os testes anteriores não cobrem ──────────────
 * Os testes das Fases 6 e 9 exercitam as duas metades separadamente: o
 * dispatcher com providers/enriquecedores sintéticos (Properties 1, 2, 11, 12) e
 * `getStravaActivityVisualData` com o `StravaClient` INJETADO por
 * `options.client` (Properties 9, 13, 16). Nenhum dos dois prova que a ligação
 * da Tarefa 19.1 funciona de ponta a ponta, porque o registry chama o
 * enriquecedor com UM único argumento (`enrich(activity)`) — o caminho em que
 * `options` fica vazio e o módulo resolve o client por conta própria.
 *
 * Este teste percorre a cadeia completa e real:
 *
 *   getActivityVisualData (core)
 *     → hasCapability("STRAVA", "activityDetails")            [catálogo real]
 *     → getActivityDetailEnricherLoader("STRAVA")             [registry real]
 *     → import("@/modules/strava").getStravaActivityVisualData [barrel real]
 *     → createStravaClient()                                  [ÚNICO seam mockado]
 *     → parseStravaStreams / parseStravaLaps / toHeartRateSamples  [parsers reais]
 *     → resolveMaxHeartRateReference / computeHeartRateZonesFromStream [cálculo real]
 *     → composição de barSections/metricSections               [enriquecedor real]
 *
 * ── Escolha do seam de mock ─────────────────────────────────────────────────
 * O único ponto substituído é `createStravaClient` (via `vi.mock` do barrel
 * `@/modules/strava/api/client`, preservando todo o resto do módulo com
 * `importOriginal`). Essa escolha é deliberada:
 *
 * - mockar `@/modules/strava` inteiro (ou o próprio
 *   `getStravaActivityVisualData`) anularia o objetivo: o enriquecedor real, os
 *   parsers reais e o cálculo real de zonas deixariam de ser exercitados —
 *   sobraria um teste do mock;
 * - injetar `options.client` é impossível aqui: o registry chama
 *   `enrich(activity)` sem opções. Justamente esse caminho é o que precisa ser
 *   provado;
 * - mockar `fetch` (dentro do `StravaClient` real) arrastaria o refresh de
 *   token, o cofre de secrets e o rate limiter para dentro do teste — camadas já
 *   cobertas por `modules/strava/tests/strava-client.test.ts` e irrelevantes
 *   para a ligação dispatcher → enriquecedor.
 *
 * `createStravaClient` é a fronteira de I/O do módulo: acima dele está tudo o
 * que esta tarefa precisa validar; abaixo dele está apenas rede.
 *
 * ── Guarda estática ────────────────────────────────────────────────────────
 * A última cláusula da tarefa ("sem nenhuma comparação direta a `"STRAVA"` no
 * código do core") é verificada lendo os fontes de
 * `modules/shared/activities/presentation/**` e procurando comparações por
 * identidade de provider — com um controle positivo que prova que o scanner
 * detectaria a violação se ela existisse.
 *
 * Fixtures sanitizadas (sem PII, sem tokens) reaproveitadas de
 * `modules/strava/tests/fixtures/`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Activity } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted) -------------------------------------------------------

/**
 * Porta-voz do client de teste, criado com `vi.hoisted` para poder ser
 * referenciado pela fábrica do `vi.mock` (que é elevada acima dos imports).
 * `createCalls` conta quantas vezes o módulo Strava REALMENTE resolveu um
 * client — é a evidência de que o caminho sem `options.client` foi percorrido.
 *
 * `inert` é o client devolvido quando nenhum dublê está instalado: carregar o
 * barrel `@/modules/strava` constrói `stravaModule` e, com ele,
 * `createStravaActivityProvider()`, cujo parâmetro default é
 * `createStravaClient()` — ou seja, o barrel resolve um client no momento do
 * import, antes de qualquer teste. Devolver um stub inerte (em vez de lançar)
 * mantém esse import fiel ao de produção; os métodos rejeitam porque nenhum
 * teste deste arquivo usa esse caminho.
 */
const clientHolder = vi.hoisted(() => ({
  current: null as unknown,
  createCalls: 0,
  inert: {
    getActivityStreams: async () => {
      throw new Error("Nenhum StravaClient de teste instalado.");
    },
    getActivityLaps: async () => {
      throw new Error("Nenhum StravaClient de teste instalado.");
    },
  } as unknown,
}));

/**
 * Prisma é substituído por um objeto vazio: carregar o barrel
 * `@/modules/strava` (o que o registry faz por dynamic import) arrasta
 * auth/webhooks/sync, que importam `@/server/db`. Nenhum deles é chamado neste
 * teste — instanciar um `PrismaClient` real seria só um efeito colateral
 * indesejado. Mesmo padrão dos demais testes do módulo Strava.
 */
vi.mock("@/server/db", () => ({ prisma: {} }));

/**
 * ÚNICO seam: `createStravaClient`. Todo o resto do barrel do client (classes de
 * erro `StravaClientError`/`StravaAuthError`/`StravaRateLimitExceededError`,
 * usadas pelo enriquecedor para classificar falhas) permanece REAL via
 * `importOriginal`.
 */
vi.mock("@/modules/strava/api/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/strava/api/client")>();

  return {
    ...actual,
    createStravaClient: () => {
      clientHolder.createCalls += 1;
      return clientHolder.current ?? clientHolder.inert;
    },
  };
});

// Registra o resolver de capabilities do catálogo (mesmo import de efeito
// colateral usado em produção).
import "@/modules/shared/integrations/catalog";

import { formatDuration } from "@/lib/format";
import { HEART_RATE_ZONES_SECTION_ID } from "@/modules/shared/activities/heart-rate-zones";
import type {
  ActivityBarSection,
  ActivityMetricSection,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";
import {
  buildBaseActivityVisualData,
  getActivityVisualData,
} from "@/modules/shared/activities/presentation/get-activity-visual-data";
import type {
  StravaClient,
  StravaClientContext,
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
  STRAVA_DETAIL_STREAM_KEYS,
  STRAVA_HEART_RATE_ZONES_DISCLAIMER,
  STRAVA_SPLITS_SECTION_ID,
  STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
  stravaActivityVisualCache,
} from "@/modules/strava/application/activities/strava-activity-details";
import {
  buildEmptyLapList,
  buildLapList,
} from "@/modules/strava/tests/fixtures/activity-laps";
import {
  buildEmptyStreamSet,
  buildStreamSet,
} from "@/modules/strava/tests/fixtures/activity-streams";

// ---------------------------------------------------------------------------
// Payloads remotos (validados pelos schemas REAIS do client)
// ---------------------------------------------------------------------------

/**
 * `StreamSet` de sucesso, passado pelo schema real — o dublê devolve exatamente
 * o que `getActivityStreams` devolveria. `time` + `heartrate` são a base das
 * zonas calculadas; `cadence`/`distance`/`velocity_smooth` alimentam as séries
 * da análise do treino.
 */
const STREAM_SET: StravaStreamSetObjectDto = stravaStreamSetObjectSchema.parse(
  buildStreamSet(),
);

/** Lista de laps de sucesso (3 voltas com métricas), validada pelo schema real. */
const LAP_LIST: StravaLapDto[] = stravaLapListSchema.parse(buildLapList());

/** `StreamSet` vazio: atividade sem nenhum dos streams pedidos (resposta válida). */
const EMPTY_STREAM_SET: StravaStreamSetObjectDto =
  stravaStreamSetObjectSchema.parse(buildEmptyStreamSet());

/** Atividade sem voltas registradas (resposta válida, lista vazia). */
const EMPTY_LAP_LIST: StravaLapDto[] = stravaLapListSchema.parse(
  buildEmptyLapList(),
);

const CONNECTION_ID = "conn_strava_e2e";
const USER_ID = "user_strava_e2e";
const EXTERNAL_ID = "9000000042";

// ---------------------------------------------------------------------------
// Fixtures de atividade
// ---------------------------------------------------------------------------

/**
 * Atividade Strava de corrida com FC máxima > FC média: é a condição do
 * Requisito 2.4-a para a FC máxima de referência existir e, portanto, para as
 * zonas calculadas serem exibidas. Nenhum dado real de usuário.
 */
function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act_strava_e2e",
    userId: USER_ID,
    wearableConnectionId: CONNECTION_ID,
    externalId: EXTERNAL_ID,
    provider: "STRAVA",
    sportType: "run",
    providerSportType: "Run",
    name: "Corrida de teste",
    startedAt: new Date("2026-02-10T09:00:00.000Z"),
    endedAt: null,
    durationSeconds: 1_800,
    movingSeconds: null,
    distanceMeters: 5_000,
    calories: 320,
    averageHeartRate: 150,
    maxHeartRate: 172,
    averagePace: 360,
    averageSpeed: 2.78,
    maxSpeed: 3.2,
    elevationGain: 42,
    averageCadence: 168,
    averagePower: null,
    maxPower: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-02-10T09:40:00.000Z"),
    updatedAt: new Date("2026-02-10T09:40:00.000Z"),
    ...overrides,
  } as unknown as Activity;
}

// ---------------------------------------------------------------------------
// Dublê do StravaClient (instalado no seam `createStravaClient`)
// ---------------------------------------------------------------------------

interface StreamsCall {
  ctx: StravaClientContext;
  id: string | number;
  keys: readonly string[];
}

interface LapsCall {
  ctx: StravaClientContext;
  id: string | number;
}

interface RecordedCalls {
  streams: StreamsCall[];
  laps: LapsCall[];
}

/**
 * Instala um dublê com apenas os dois métodos que o enriquecedor consome,
 * registrando os argumentos recebidos: são eles que provam que o enriquecedor
 * real montou a chamada (id externo da atividade, contexto da conexão e as keys
 * de stream do detalhe).
 */
function installFakeClient(payloads: {
  streams: StravaStreamSetObjectDto;
  laps: StravaLapDto[];
}): RecordedCalls {
  const calls: RecordedCalls = { streams: [], laps: [] };

  clientHolder.current = {
    getActivityStreams: async (
      ctx: StravaClientContext,
      id: string | number,
      params: { keys: readonly string[] },
    ) => {
      calls.streams.push({ ctx, id, keys: params.keys });
      return payloads.streams;
    },
    getActivityLaps: async (ctx: StravaClientContext, id: string | number) => {
      calls.laps.push({ ctx, id });
      return payloads.laps;
    },
  } as unknown as StravaClient;

  return calls;
}

// ---------------------------------------------------------------------------
// Leitura das seções produzidas
// ---------------------------------------------------------------------------

function findBarSection(
  view: ActivityVisualData,
  id: string,
): ActivityBarSection | undefined {
  return view.barSections.find((section) => section.id === id);
}

function findMetricSection(
  view: ActivityVisualData,
  id: string,
): ActivityMetricSection | undefined {
  return view.metricSections.find((section) => section.id === id);
}

function rowLabels(section: ActivityMetricSection | undefined): string[] {
  return (section?.metrics ?? []).map((row) => row.label);
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

/**
 * Pré-carrega o barrel `@/modules/strava` — exatamente o módulo que o registry
 * carrega por dynamic import. O import em si resolve um client (ver a nota em
 * `clientHolder.inert`), e fazê-lo aqui, uma única vez, deixa o contador
 * `createCalls` de cada teste medindo APENAS a resolução feita pelo
 * enriquecedor, sem depender da ordem dos testes.
 */
beforeAll(async () => {
  await import("@/modules/strava");
});

beforeEach(() => {
  stravaActivityVisualCache.clear();
  clientHolder.current = null;
  clientHolder.createCalls = 0;
  // Logs estruturados do enriquecimento (`logIntegrationEvent`) são silenciados:
  // o alvo aqui é a visão devolvida.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  stravaActivityVisualCache.clear();
  clientHolder.current = null;
});

// ---------------------------------------------------------------------------
// 1. Dispatcher → enriquecedor real do Strava
// ---------------------------------------------------------------------------

describe("getActivityVisualData com o enriquecedor real do Strava (Tarefa 19.2)", () => {
  it("resolve o módulo Strava pelo registry e monta zonas calculadas, splits e análise do treino", async () => {
    const activity = makeActivity();
    const calls = installFakeClient({ streams: STREAM_SET, laps: LAP_LIST });

    const view = await getActivityVisualData(activity);

    // O módulo Strava resolveu o client por conta própria: o registry chama o
    // enriquecedor com um único argumento, então `options.client` está vazio e
    // `createStravaClient()` é o caminho exercitado (Requisito 1.2).
    expect(clientHolder.createCalls).toBe(1);
    expect(calls.streams).toHaveLength(1);
    expect(calls.laps).toHaveLength(1);

    // Chamadas montadas pelo enriquecedor real, com o id EXTERNO da atividade
    // (não o id interno) e o contexto da conexão.
    expect(calls.streams[0].id).toBe(EXTERNAL_ID);
    expect(calls.laps[0].id).toBe(EXTERNAL_ID);
    expect(calls.streams[0].ctx).toMatchObject({
      connectionId: CONNECTION_ID,
      userId: USER_ID,
    });
    expect(calls.streams[0].keys).toEqual(STRAVA_DETAIL_STREAM_KEYS);
    expect(calls.streams[0].keys).toContain("heartrate");
    expect(calls.streams[0].keys).toContain("time");

    // --- Zonas de FC CALCULADAS (Requisitos 2.1, 2.3, 2.5) ----------------
    const zones = findBarSection(view, HEART_RATE_ZONES_SECTION_ID);

    expect(zones).toBeDefined();
    expect(zones?.approximate).toBe(true);
    expect(zones?.disclaimer).toBe(STRAVA_HEART_RATE_ZONES_DISCLAIMER);
    // 5 faixas por %FCmáx, produzidas pelo cálculo compartilhado real.
    expect(zones?.items).toHaveLength(5);

    const zoneRatioTotal = (zones?.items ?? []).reduce(
      (total, item) => total + item.ratio,
      0,
    );
    expect(zoneRatioTotal).toBeCloseTo(1, 10);

    // A série da fixture (time 0..40s, FC 118→149 com FCmáx 172) cai nas faixas
    // 2 (10s), 3 (10s) e 4 (20s) — nenhum tempo em recuperação nem em máxima.
    // Checar o VALOR de uma barra prova que o cálculo real rodou sobre o stream
    // que o client devolveu, e não um placeholder qualquer.
    expect(zones?.items[3].valueText).toBe(`${formatDuration(20)} · 50%`);
    expect(zones?.items[0].ratio).toBe(0);
    expect(zones?.items[4].ratio).toBe(0);

    // --- Splits (Requisitos 5.4, 6.2) -------------------------------------
    const splits = findBarSection(view, STRAVA_SPLITS_SECTION_ID);

    expect(splits).toBeDefined();
    // Uma barra por lap da fixture, na ordem de `lap_index`.
    expect(splits?.items).toHaveLength(LAP_LIST.length);
    expect(splits?.items.map((item) => item.label)).toEqual([
      "Split 1",
      "Split 2",
      "Split 3",
    ]);
    // Categoria "endurance-pace" (corrida): ritmo por km entra no texto do
    // split; potência (que a fixture traz) não, porque a categoria não a exibe.
    expect(splits?.items[0].valueText).toContain("/km");
    expect(splits?.items[0].valueText).not.toContain("W");

    // --- Análise do treino (Requisitos 6.1, 6.2) --------------------------
    const analysis = findMetricSection(view, STRAVA_WORKOUT_ANALYSIS_SECTION_ID);
    const labels = rowLabels(analysis);

    expect(analysis).toBeDefined();
    // Sub-blocos das TRÊS fontes: zonas (esforço), laps (splits) e streams.
    expect(labels).toContain("Tempo em zonas intensas");
    expect(labels).toContain("Splits registrados");
    expect(labels).toContain("Variação de ritmo entre splits");
    expect(labels).toContain("FC ao longo do treino");
    expect(labels).toContain("Cadência ao longo do treino");
    // Categoria sem `speedFallback`: nenhuma linha de velocidade é fabricada.
    expect(labels).not.toContain("Velocidade ao longo do treino");
    expect(analysis?.metrics.every((row) => row.value.length > 0)).toBe(true);

    // --- Piso da visão enriquecida = visão base normalizada ---------------
    const base = buildBaseActivityVisualData(activity);

    expect(view.provider).toBe("STRAVA");
    expect(view.sportKey).toBe("run");
    expect(view.heroStats).toEqual(base.heroStats);
    expect(view.overviewMetrics).toEqual(base.overviewMetrics);
    // A visão base NUNCA produz seções ricas — a diferença é o enriquecimento.
    expect(base.barSections).toEqual([]);
    expect(base.metricSections).toEqual([]);
  });

  it("cai na visão base quando o Strava não devolve stream nem lap (omissão graciosa)", async () => {
    const activity = makeActivity();
    const calls = installFakeClient({
      streams: EMPTY_STREAM_SET,
      laps: EMPTY_LAP_LIST,
    });

    const view = await getActivityVisualData(activity);

    // O enriquecedor foi acionado e buscou as duas fontes...
    expect(clientHolder.createCalls).toBe(1);
    expect(calls.streams).toHaveLength(1);
    expect(calls.laps).toHaveLength(1);

    // ...e, sem nenhuma fonte, o resultado é exatamente a visão base: sem erro,
    // sem seção vazia, sem placeholder (Requisitos 1.3, 7.3, 7.4).
    expect(view).toEqual(buildBaseActivityVisualData(activity));
    expect(view.barSections).toEqual([]);
    expect(view.metricSections).toEqual([]);
    expect(view.heroStats.length).toBeGreaterThan(0);
    expect(view.overviewMetrics.length).toBeGreaterThan(0);
  });

  it("não aciona o módulo Strava para um provider sem enriquecedor registrado", async () => {
    const activity = makeActivity({ provider: "POLAR" } as Partial<Activity>);
    const calls = installFakeClient({ streams: STREAM_SET, laps: LAP_LIST });

    const view = await getActivityVisualData(activity);

    // Sem capability `activityDetails` no catálogo e sem entrada no registry: o
    // dispatcher nem chega ao módulo de nenhum provider (Requisitos 1.3, 7.2).
    expect(clientHolder.createCalls).toBe(0);
    expect(calls.streams).toEqual([]);
    expect(calls.laps).toEqual([]);
    expect(calls.laps).toEqual([]);
    expect(view).toEqual(buildBaseActivityVisualData(activity));
    expect(view.provider).toBe("POLAR");
  });
});

// ---------------------------------------------------------------------------
// 2. Guarda estática: o core não compara identidade de provider
// ---------------------------------------------------------------------------

const PRESENTATION_DIR = fileURLToPath(
  new URL("../modules/shared/activities/presentation", import.meta.url),
);

const PROVIDER_IDS = [
  "GARMIN",
  "STRAVA",
  "POLAR",
  "COROS",
  "SUUNTO",
  "FITBIT",
] as const;

/**
 * Comparação por identidade de provider em suas formas usuais: igualdade em
 * qualquer direção (`x === "STRAVA"`, `"STRAVA" === x`, `!==`, `==`, `!=`) e
 * `case "STRAVA":` dentro de um `switch`.
 *
 * Chaves de objeto (`STRAVA: async () => ...`, como no registry) NÃO casam: uma
 * tabela de lookup indexada por `ProviderId` é justamente o mecanismo que
 * substitui a comparação, não uma violação dela.
 */
function buildProviderIdentityPattern(): RegExp {
  const ids = PROVIDER_IDS.join("|");

  return new RegExp(
    [
      `(?:===|!==|==|!=)\\s*["'\`](?:${ids})["'\`]`,
      `["'\`](?:${ids})["'\`]\\s*(?:===|!==|==|!=)`,
      `case\\s+["'\`](?:${ids})["'\`]\\s*:`,
    ].join("|"),
    "g",
  );
}

/**
 * Remove comentários antes do scan: os fontes do core DOCUMENTAM em prosa a
 * regra que seguem (ex.: "nunca `provider === \"GARMIN\"`"), e essa menção não
 * é código. São descartadas as linhas de comentário (`//`, e `*` das linhas
 * internas de JSDoc) e os blocos `/* ... *\/` inteiros.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join("\n");
}

/** Fontes de produção (não-teste) de um diretório, recursivamente. */
function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    const isTypeScript = /\.tsx?$/.test(entry);
    const isTest = /\.test\.tsx?$/.test(entry);

    return isTypeScript && !isTest ? [fullPath] : [];
  });
}

function findProviderIdentityComparisons(source: string): string[] {
  return stripComments(source).match(buildProviderIdentityPattern()) ?? [];
}

describe("modules/shared/activities/presentation/** é agnóstico a identidade de provider (Requisito 7.1)", () => {
  const sourceFiles = collectSourceFiles(PRESENTATION_DIR);

  it("encontra os fontes do core de apresentação", () => {
    // Guarda de vacuidade: um diretório vazio faria o teste abaixo passar sem
    // verificar nada.
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(sourceFiles.map((file) => path.basename(file))).toContain(
      "get-activity-visual-data.ts",
    );
    expect(sourceFiles.map((file) => path.basename(file))).toContain(
      "activity-detail-enrichment-registry.ts",
    );
  });

  it("nenhum fonte compara o identificador do provider", () => {
    const violations = sourceFiles.flatMap((file) => {
      const matches = findProviderIdentityComparisons(readFileSync(file, "utf8"));

      return matches.map(
        (match) => `${path.relative(PRESENTATION_DIR, file)}: ${match}`,
      );
    });

    expect(violations).toEqual([]);
  });

  it("controle positivo: o scanner detecta a comparação onde ela existe de fato", () => {
    // Sem este controle, "nenhuma violação" poderia significar apenas que o
    // scanner não funciona. O enriquecedor do Strava — que é código de MÓDULO DE
    // PROVIDER, onde a comparação é legítima — contém `provider !== "STRAVA"`.
    const enricherSource = readFileSync(
      fileURLToPath(
        new URL(
          "../modules/strava/application/activities/strava-activity-details.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(findProviderIdentityComparisons(enricherSource).length).toBeGreaterThan(0);

    // E casa as demais formas sintáticas de comparação.
    expect(
      findProviderIdentityComparisons('if (activity.provider === "STRAVA") {}'),
    ).toHaveLength(1);
    expect(
      findProviderIdentityComparisons('if ("GARMIN" === providerId) {}'),
    ).toHaveLength(1);
    expect(findProviderIdentityComparisons('case "STRAVA":')).toHaveLength(1);

    // ...sem confundir a tabela de lookup do registry com uma comparação.
    expect(
      findProviderIdentityComparisons("const loaders = { STRAVA: loader };"),
    ).toEqual([]);
  });
});
