/**
 * Enriquecimento do detalhe visual de atividade do Strava (Tarefa 16.1).
 *
 * Estruturalmente paralelo a
 * `modules/garmin/application/activities/garmin-activity-details.ts`: mesma
 * forma de retorno (`ActivityVisualData`), mesmo padrão de cache em memória com
 * TTL curto e mesmo padrão de "carregar tolerante a falha individual"
 * (`loadOptional`) — mas usando o `StravaClient` (streams/laps) e cálculo local
 * em vez dos endpoints nativos de zonas/splits do Garmin.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Contrato de tolerância a falha (Requisito 9.4)
 *
 * Esta função NUNCA lança. Qualquer falha na busca de streams/laps
 * (401/403/404/429/5xx/timeout/JSON inválido/payload que falha na validação
 * Zod) é tratada como **ausência daquele dado**: o bloco correspondente
 * simplesmente não é montado. Falhar em obter dado rico degrada para a visão
 * base normalizada (o dispatcher em
 * `modules/shared/activities/presentation/get-activity-visual-data.ts` usa a
 * visão base quando o enriquecedor devolve `null`), nunca em erro de página.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Observabilidade (Requisitos 10.1, 10.2)
 *
 * Cada busca (streams e laps) emite um `logIntegrationEvent` estruturado com
 * `provider`/`operation`/`status`/`connectionId`, mais um evento agregado com a
 * disponibilidade das fontes. Nenhum token, segredo ou PII é logado — apenas
 * identificadores de conexão, contagens e status estáveis de baixa
 * cardinalidade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Composição das seções visuais
 *
 * Três blocos são compostos, todos condicionados à categoria de exibição de
 * métricas da modalidade (`MetricDisplayRules`) **e** à existência real do dado:
 *
 * 1. zonas de FC **calculadas** a partir do stream de FC (`toHeartRateSamples` +
 *    `computeHeartRateZonesFromStream`), marcadas com `approximate: true` +
 *    `disclaimer` (Tarefa 17.1);
 * 2. splits/voltas a partir de `sources.laps` (Tarefa 17.3);
 * 3. a seção de análise do treino (`metricSections`), com a leitura
 *    interpretativa do esforço: tempo relativo em zonas, variação de
 *    pace/velocidade/cadência/FC entre splits e faixas das séries do treino
 *    (Tarefa 17.3).
 *
 * Quando nenhuma seção pode ser composta, a função devolve `null` (a visão base
 * já é suficiente), que é exatamente o caminho de omissão graciosa.
 *
 * _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 4.3, 4.4, 4.6, 5.4, 5.6, 6.1, 6.2,
 * 6.3, 6.4, 6.5, 6.6, 9.4, 10.1, 10.2, 10.4_
 */

import type { Activity } from "@prisma/client";

// Import de efeito colateral: registra o resolver de capabilities do catálogo,
// garantindo que `hasCapability` funcione mesmo que nada mais tenha carregado o
// catálogo neste caminho de execução (mesmo padrão do dispatcher do core).
import "@/modules/shared/integrations/catalog";

import {
  formatCadence,
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import {
  computeHeartRateZonesFromStream,
  resolveMaxHeartRateReference,
} from "@/modules/shared/activities/heart-rate-zones";
import type { MetricDisplayRules } from "@/modules/shared/activities/metric-display-categories";
import {
  METRIC_DISPLAY_RULES,
  getMetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import type {
  ActivityBarSection,
  ActivityMetricRow,
  ActivityMetricSection,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";
import { buildBaseActivityVisualData } from "@/modules/shared/activities/presentation/get-activity-visual-data";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";
import { hasCapability } from "@/modules/shared/integrations/capabilities";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability";
import type {
  StravaClient,
  StravaClientContext,
} from "@/modules/strava/api/client";
import {
  createStravaClient,
  StravaAuthError,
  StravaClientError,
  StravaRateLimitExceededError,
} from "@/modules/strava/api/client";
import type {
  ParsedActivityLap,
  ParsedActivityStream,
} from "@/modules/strava/parsers";
import {
  parseStravaLaps,
  parseStravaStreams,
  toHeartRateSamples,
} from "@/modules/strava/parsers";

/**
 * TTL do cache em memória do detalhe enriquecido — 5 minutos, o MESMO TTL usado
 * por `garminActivityVisualCache`, para que os dois providers tenham a mesma
 * janela de frescor (Requisito 10.4).
 */
export const STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS = 1000 * 60 * 5;

/**
 * Streams pedidos ao Strava para o detalhe de atividade.
 *
 * `time` é pedido sempre porque é o eixo temporal que `toHeartRateSamples`
 * pareia com `heartrate` (mesmo índice = mesmo instante). Os demais cobrem o
 * que a composição das Tarefas 17.1/17.3 pode usar por categoria de exibição de
 * métricas. Streams que a atividade não possui simplesmente não voltam na
 * resposta — ausência de dado, não erro.
 */
export const STRAVA_DETAIL_STREAM_KEYS: readonly string[] = [
  "time",
  "distance",
  "heartrate",
  "cadence",
  "watts",
  "velocity_smooth",
  "altitude",
];

/**
 * Aviso de aproximação das zonas de FC calculadas (Requisito 2.5).
 *
 * O Strava não expõe as zonas configuradas pelo atleta por um caminho utilizável
 * aqui (endpoint de zonas do atleta exige o scope `profile:read_all`; o de zonas
 * por atividade é documentado como exclusivo de contas Summit), então as zonas
 * exibidas são calculadas pela Ryvano por `%FCmáx` e podem divergir das
 * configuradas na conta do atleta. Este texto é o que a UI mostra ao lado da
 * seção quando `approximate` é `true`.
 */
export const STRAVA_HEART_RATE_ZONES_DISCLAIMER =
  "Zonas estimadas por %FC máx. — podem diferir das configuradas no Strava.";

/**
 * `id` da seção de barras de splits/voltas montada a partir dos laps.
 *
 * Exposto para os testes poderem localizar a seção sem repetir a string.
 */
export const STRAVA_SPLITS_SECTION_ID = "splits";

/**
 * `id` da seção de análise do treino (`metricSections`).
 *
 * Exposto para os testes poderem localizar a seção sem repetir a string.
 */
export const STRAVA_WORKOUT_ANALYSIS_SECTION_ID = "workout-analysis";

/**
 * Máximo de barras de split exibidas.
 *
 * Uma atividade pode ter dezenas/centenas de laps (voltas automáticas de
 * natação, por exemplo); acima disso a lista de barras deixa de ser legível.
 * Mesmo teto usado pelo detalhe do Garmin.
 */
const MAX_SPLIT_BARS = 12;

/**
 * Piso do `ratio` das barras de split: uma barra proporcionalmente minúscula
 * ficaria invisível na UI. Mesmo piso usado pelo detalhe do Garmin.
 */
const MIN_SPLIT_BAR_RATIO = 0.08;

/** Paleta das barras de split (mesma escala visual dos splits do Garmin). */
const SPLIT_BAR_COLORS = [
  "linear-gradient(90deg,#22d3ee,#38bdf8)",
  "linear-gradient(90deg,#a78bfa,#c084fc)",
  "linear-gradient(90deg,#4ade80,#22c55e)",
  "linear-gradient(90deg,#f59e0b,#fb7185)",
] as const;

/**
 * Agrupamento das 5 faixas calculadas por `computeHeartRateZonesFromStream` em
 * três leituras de esforço (leve/moderado/intenso), na ordem fixa produzida pelo
 * cálculo compartilhado (`HEART_RATE_ZONE_LABELS`).
 */
const HEART_RATE_EFFORT_GROUPS: readonly {
  label: string;
  indexes: readonly number[];
}[] = [
  { label: "Tempo em zonas leves", indexes: [0, 1] },
  { label: "Tempo em zona moderada", indexes: [2] },
  { label: "Tempo em zonas intensas", indexes: [3, 4] },
];

/** Operação lógica dos logs de busca de streams para o detalhe. */
const STREAMS_OPERATION = "activity_detail_streams";

/** Operação lógica dos logs de busca de laps para o detalhe. */
const LAPS_OPERATION = "activity_detail_laps";

/** Operação lógica do log agregado do enriquecimento de detalhe. */
const ENRICHMENT_OPERATION = "activity_detail_enrichment";

/** Entrada do cache: o valor cacheado inclui `null` (ausência de dado rico). */
interface StravaActivityVisualCacheEntry {
  expiresAt: number;
  value: ActivityVisualData | null;
}

/**
 * Cache em memória por `activity.id` + `activity.updatedAt` (Requisito 10.4).
 *
 * A chave inclui o `updatedAt` para que uma atividade reprocessada (webhook de
 * update, novo sync) gere naturalmente uma entrada nova, sem invalidação
 * explícita. Resultados `null` também são cacheados: repetir a busca a cada
 * render quando não há dado rico só queimaria cota do Strava.
 *
 * Exposto para os testes poderem isolar cada cenário (`.clear()`); não faz parte
 * da superfície pública do módulo.
 *
 * @internal
 */
export const stravaActivityVisualCache = new Map<
  string,
  StravaActivityVisualCacheEntry
>();

/** Opções de `getStravaActivityVisualData` (injeção para testes). */
export interface GetStravaActivityVisualDataOptions {
  /** Client injetável (default: `createStravaClient()`). */
  client?: StravaClient;
  /** Relógio injetável (default `Date.now`), para TTL determinístico. */
  now?: () => number;
}

/**
 * Fontes de dado rico obtidas do Strava para uma atividade, já em estrutura
 * interna (o DTO remoto nunca atravessa daqui para fora).
 *
 * Listas vazias significam "fonte indisponível" — seja porque a atividade não
 * tem o dado, seja porque a busca falhou. As duas situações são equivalentes
 * para a composição: o bloco correspondente é omitido.
 */
interface StravaActivityDetailSources {
  streams: ParsedActivityStream[];
  laps: ParsedActivityLap[];
}

/** Chave de cache de uma atividade (id + instante da última atualização). */
function buildCacheKey(activity: Activity): string {
  return `${activity.id}:${new Date(activity.updatedAt).toISOString()}`;
}

/**
 * Traduz um erro qualquer em um `status` de log estável e de baixa
 * cardinalidade. Nunca inclui a mensagem crua do erro nos campos estruturados
 * (poderia carregar conteúdo inesperado); só o `code`/`httpStatus` tipados do
 * client, que são seguros por construção (Requisito 10.1).
 */
function toFailureStatus(error: unknown): string {
  if (error instanceof StravaAuthError) {
    return "unauthorized";
  }

  if (error instanceof StravaRateLimitExceededError) {
    return "rate_limited";
  }

  if (error instanceof StravaClientError) {
    switch (error.code) {
      case "STRAVA_CLIENT_TIMEOUT":
        return "timeout";
      case "STRAVA_CLIENT_NETWORK_ERROR":
        return "network_error";
      case "STRAVA_INVALID_JSON":
      case "STRAVA_INVALID_RESPONSE":
        return "invalid_response";
      case "STRAVA_HTTP_ERROR":
        return "http_error";
      default:
        return "client_error";
    }
  }

  return "error";
}

/** `httpStatus` seguro do erro, quando o client o conhece. */
function toFailureHttpStatus(error: unknown): number | undefined {
  return error instanceof StravaClientError ? error.httpStatus : undefined;
}

/**
 * Executa UMA busca opcional: em caso de falha (qualquer erro), loga o desfecho
 * e devolve o `fallback`, tratando a falha como ausência do dado (Requisito
 * 9.4). Mesmo padrão do `loadOptional` de `garmin-activity-details.ts`, com o
 * logging estruturado exigido pelo Requisito 10.2 embutido.
 */
async function loadOptional<T>(args: {
  operation: string;
  connectionId: string;
  loader: () => Promise<T>;
  fallback: T;
  /** Metadados SEGUROS (contagens/booleanos) do resultado, para o log de sucesso. */
  summarize?: (value: T) => Record<string, unknown>;
}): Promise<T> {
  try {
    const value = await args.loader();

    logIntegrationEvent("info", "Strava activity detail fetch succeeded", {
      provider: "STRAVA",
      operation: args.operation,
      status: "ok",
      connectionId: args.connectionId,
      ...(args.summarize?.(value) ?? {}),
    });

    return value;
  } catch (error) {
    logIntegrationEvent("warn", "Strava activity detail fetch unavailable", {
      provider: "STRAVA",
      operation: args.operation,
      status: toFailureStatus(error),
      connectionId: args.connectionId,
      httpStatus: toFailureHttpStatus(error),
    });

    return args.fallback;
  }
}

/**
 * Busca streams e laps EM PARALELO, tolerando falha individual: uma chamada que
 * falha não impede a outra de contribuir (`Promise.all` sobre `loadOptional`,
 * que nunca rejeita).
 *
 * Cada fonte só é buscada quando a capability correspondente está declarada no
 * catálogo (`streams`/`laps`) — o catálogo é a fonte de verdade sobre o que o
 * provider oferece, evitando gastar cota em endpoints que não se aplicam.
 */
async function loadStravaActivityDetailSources(
  activity: Activity,
  options: GetStravaActivityVisualDataOptions,
): Promise<StravaActivityDetailSources> {
  const empty: StravaActivityDetailSources = { streams: [], laps: [] };
  const wantsStreams = hasCapability("STRAVA", "streams");
  const wantsLaps = hasCapability("STRAVA", "laps");

  if (!wantsStreams && !wantsLaps) {
    return empty;
  }

  // A construção do client depende de config/ENV e pode lançar: ausência de
  // client é ausência de dado, nunca erro propagado.
  let client: StravaClient;
  try {
    client = options.client ?? createStravaClient();
  } catch (error) {
    logIntegrationEvent("warn", "Strava client unavailable for activity detail", {
      provider: "STRAVA",
      operation: ENRICHMENT_OPERATION,
      status: toFailureStatus(error),
      connectionId: activity.wearableConnectionId,
    });
    return empty;
  }

  const connectionId = activity.wearableConnectionId;
  const ctx: StravaClientContext = {
    connectionId,
    userId: activity.userId,
  };

  const [streams, laps] = await Promise.all([
    wantsStreams
      ? loadOptional({
          operation: STREAMS_OPERATION,
          connectionId,
          fallback: [] as ParsedActivityStream[],
          loader: async () =>
            parseStravaStreams(
              await client.getActivityStreams(ctx, activity.externalId, {
                keys: STRAVA_DETAIL_STREAM_KEYS,
              }),
            ),
          summarize: (value) => ({ streamCount: value.length }),
        })
      : Promise.resolve<ParsedActivityStream[]>([]),
    wantsLaps
      ? loadOptional({
          operation: LAPS_OPERATION,
          connectionId,
          fallback: [] as ParsedActivityLap[],
          loader: async () =>
            parseStravaLaps(await client.getActivityLaps(ctx, activity.externalId)),
          summarize: (value) => ({ lapCount: value.length }),
        })
      : Promise.resolve<ParsedActivityLap[]>([]),
  ]);

  return { streams, laps };
}

/**
 * Regras de exibição de métricas da atividade, resolvidas pela modalidade
 * canônica — nunca pelo provider (Requisitos 12.1, 12.3).
 *
 * `activity.sportType` é uma string crua persistida: pode ser um valor legado ou
 * uma modalidade que a taxonomia canônica ainda não cobre. Nesse caso cai na
 * categoria `"default"`, exatamente como faz o dispatcher do core
 * (`resolveMetricDisplayRules` em `get-activity-visual-data.ts`), de modo que as
 * duas metades do detalhe (visão base e enriquecimento) nunca discordam sobre o
 * que faz sentido exibir. Nunca lança.
 */
function resolveMetricDisplayRules(activity: Activity): MetricDisplayRules {
  const raw = activity.sportType?.trim();
  const sportKey = raw ? raw.toLowerCase() : "default";
  const category = isRyvanoSportType(sportKey)
    ? getMetricDisplayCategory(sportKey)
    : "default";

  return METRIC_DISPLAY_RULES[category];
}

/**
 * Monta a seção de zonas de FC calculadas a partir do stream de FC da atividade
 * (Tarefa 17.1).
 *
 * Três condições precisam valer, e a ausência de qualquer uma é **omissão
 * graciosa**, não erro (Requisito 2.6):
 *
 * 1. a categoria de exibição de métricas da modalidade admite zonas de FC
 *    (`rules.heartRateZones`) — o Strava não decide isso, a modalidade decide;
 * 2. o stream de FC veio na resposta e tem amostras utilizáveis
 *    (`toHeartRateSamples` devolve `null` caso contrário) — Requisito 2.3;
 * 3. existe FC máxima de referência (`resolveMaxHeartRateReference`) — quando
 *    `null`, o Requisito 2.4-c manda NÃO exibir zonas calculadas.
 *
 * `ageYears` não é passado porque o `UserProfile` ainda não tem idade/data de
 * nascimento (ver a observação de design sobre FC máxima por idade): na prática
 * a precedência aqui é (a) FC máxima da atividade, senão nada.
 *
 * O cálculo em si é local e determinístico (Requisito 10.3) e já marca
 * `approximate: true`; aqui só se acrescenta o `disclaimer` a ser exibido, que é
 * específico do provider de origem (Requisito 2.5) e por isso mora no módulo do
 * provider, não no cálculo compartilhado. Nunca lança.
 *
 * _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7_
 */
function buildHeartRateZonesSection(
  activity: Activity,
  streams: readonly ParsedActivityStream[],
  rules: MetricDisplayRules,
): ActivityBarSection | null {
  if (!rules.heartRateZones) {
    return null;
  }

  const samples = toHeartRateSamples(streams);
  if (!samples) {
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
    disclaimer: STRAVA_HEART_RATE_ZONES_DISCLAIMER,
  };
}

/** Número finito e estritamente positivo, ou `null`. */
function positiveOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Converte velocidade média (m/s, unidade do Strava) no ritmo correspondente ao
 * formato exigido pela categoria: segundos por 100 m (natação) ou por km.
 *
 * Devolve `null` quando a categoria não exibe ritmo (`rules.pace === false`) ou
 * quando não há velocidade utilizável — ritmo derivado de velocidade zero/ausente
 * não existe, e inventar um valor violaria o Requisito 4.4.
 */
function toPaceSeconds(
  speedMetersPerSecond: number | null,
  pace: MetricDisplayRules["pace"],
): number | null {
  const speed = positiveOrNull(speedMetersPerSecond);

  if (!pace || speed === null) {
    return null;
  }

  return (pace === "pace-per-100m" ? 100 : 1000) / speed;
}

/** Formata ritmo no formato da categoria (por 100 m na natação, por km nas demais). */
function formatPaceByRules(
  paceSeconds: number,
  pace: MetricDisplayRules["pace"],
): string {
  return pace === "pace-per-100m"
    ? formatSwimPace(paceSeconds)
    : formatPace(paceSeconds);
}

/**
 * Vocabulário do bloco de splits conforme a categoria: a natação conta "voltas"
 * (o pace por 100 m é o marcador da categoria aquática), as demais modalidades
 * contam "splits". Decisão pela categoria, nunca pelo provider nem por substring
 * do `sportType` (Requisitos 4.5, 5.5, 6.6).
 */
function usesLapVocabulary(rules: MetricDisplayRules): boolean {
  return rules.pace === "pace-per-100m";
}

/**
 * Texto de um split: distância, duração, ritmo/velocidade, FC, cadência e
 * potência — cada parte incluída **somente** quando o dado existe e a categoria
 * admite aquela métrica.
 *
 * Ritmo/velocidade seguem `rules.pace`/`rules.speedFallback` e cadência segue
 * `rules.cadenceOrStrokeRate`: categorias que não exibem essas métricas não as
 * exibem aqui tampouco, mesmo que o lap traga o valor bruto (Requisitos 4.6,
 * 5.6, 6.6). Potência acompanha `speedFallback`, a mesma condição usada pela
 * visão base. FC não é condicionada à categoria (Requisito 3.1).
 *
 * Devolve string vazia quando nenhuma parte pôde ser montada — o chamador
 * descarta o split em vez de exibir uma barra sem conteúdo (Requisito 4.4).
 */
function buildSplitValueText(
  lap: ParsedActivityLap,
  rules: MetricDisplayRules,
): string {
  const parts: string[] = [];
  const push = (value: string) => {
    if (value !== "—") {
      parts.push(value);
    }
  };

  const distanceMeters = positiveOrNull(lap.distanceMeters);
  if (distanceMeters !== null) {
    push(formatDistance(distanceMeters));
  }

  const durationSeconds = positiveOrNull(lap.durationSeconds);
  if (durationSeconds !== null) {
    push(formatDuration(durationSeconds));
  }

  const paceSeconds = toPaceSeconds(lap.averageSpeed, rules.pace);
  const speedMetersPerSecond = positiveOrNull(lap.averageSpeed);

  if (paceSeconds !== null) {
    push(formatPaceByRules(paceSeconds, rules.pace));
  } else if (rules.speedFallback && speedMetersPerSecond !== null) {
    push(formatSpeed(speedMetersPerSecond * 3.6));
  }

  if (lap.averageHeartRate !== null) {
    push(formatHeartRate(lap.averageHeartRate));
  }

  if (rules.cadenceOrStrokeRate && lap.averageCadence !== null) {
    push(formatCadence(lap.averageCadence));
  }

  if (rules.speedFallback && lap.averageWatts !== null) {
    push(formatPower(lap.averageWatts));
  }

  return parts.join(" · ");
}

/** Candidato a barra de split, antes de normalizar as proporções. */
interface SplitBarCandidate {
  label: string;
  valueText: string;
  /** Grandeza que define o tamanho relativo da barra (duração ou distância). */
  magnitude: number;
}

/**
 * Monta a seção de barras de splits/voltas a partir dos laps do Strava
 * (Requisitos 5.4, 6.2).
 *
 * Os laps só chegam aqui quando a capability `laps` está declarada no catálogo —
 * `loadStravaActivityDetailSources` nem busca o endpoint caso contrário —, então
 * a decisão é sempre capability + dado presente, nunca identidade de provider
 * (Requisito 6.5).
 *
 * Devolve `null` (omissão graciosa, Requisito 6.3) quando a categoria não tem
 * análise do treino, quando não há laps, ou quando nenhum lap tem conteúdo
 * exibível — nunca uma seção com barras vazias. Nunca lança.
 *
 * _Requisitos: 4.6, 5.4, 5.6, 6.2, 6.3, 6.5, 6.6_
 */
function buildSplitsSection(
  laps: readonly ParsedActivityLap[],
  rules: MetricDisplayRules,
): ActivityBarSection | null {
  if (!rules.workoutAnalysis) {
    return null;
  }

  const lapVocabulary = usesLapVocabulary(rules);
  const candidates: SplitBarCandidate[] = [];

  laps.slice(0, MAX_SPLIT_BARS).forEach((lap, position) => {
    const magnitude =
      positiveOrNull(lap.durationSeconds) ?? positiveOrNull(lap.distanceMeters);
    const valueText = buildSplitValueText(lap, rules);

    if (magnitude === null || valueText.length === 0) {
      return;
    }

    const number = positiveOrNull(lap.index) ?? position + 1;

    candidates.push({
      label: `${lapVocabulary ? "Volta" : "Split"} ${Math.round(number)}`,
      valueText,
      magnitude,
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  const maxMagnitude = Math.max(...candidates.map((item) => item.magnitude));

  return {
    id: STRAVA_SPLITS_SECTION_ID,
    title: lapVocabulary ? "Voltas da atividade" : "Splits da atividade",
    description: lapVocabulary
      ? "Voltas registradas na atividade, com as métricas que a modalidade exibe."
      : "Splits registrados na atividade, com as métricas que a modalidade exibe.",
    items: candidates.map((item, index) => ({
      label: item.label,
      valueText: item.valueText,
      ratio: Math.max(item.magnitude / maxMagnitude, MIN_SPLIT_BAR_RATIO),
      color: SPLIT_BAR_COLORS[index % SPLIT_BAR_COLORS.length] ?? SPLIT_BAR_COLORS[0],
    })),
  };
}

/**
 * Faixa (mínimo–máximo) de uma coleção de valores, no formato da métrica.
 *
 * Exige pelo menos dois valores: uma "variação" só existe entre dois pontos, e
 * com um único valor a linha seria uma métrica agregada disfarçada. Quando todos
 * os valores coincidem, devolve o valor único em vez de uma faixa degenerada
 * (`x – x`).
 */
function formatRange(
  values: readonly number[],
  format: (value: number) => string,
): string | null {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  return min === max ? format(min) : `${format(min)} – ${format(max)}`;
}

/** Valores positivos e finitos de uma métrica dos laps, na ordem dos laps. */
function collectLapValues(
  laps: readonly ParsedActivityLap[],
  pick: (lap: ParsedActivityLap) => number | null,
): number[] {
  return laps
    .map((lap) => positiveOrNull(pick(lap)))
    .filter((value): value is number => value !== null);
}

/**
 * Amostras positivas e finitas de um stream, se ele veio na resposta.
 *
 * O filtro por valores positivos é intencional: o Strava emite `0` em trechos sem
 * leitura de sensor (cadência parada, velocidade em pausa), e usar esse `0` como
 * mínimo da faixa produziria exatamente o "valor zerado enganoso" que o
 * Requisito 4.4 proíbe.
 */
function collectStreamValues(
  streams: readonly ParsedActivityStream[],
  type: ParsedActivityStream["type"],
): number[] {
  const stream = streams.find((candidate) => candidate.type === type);

  if (!stream) {
    return [];
  }

  return stream.values.filter((value) => Number.isFinite(value) && value > 0);
}

/**
 * Linhas da leitura interpretativa das zonas de FC: quanto do treino ficou em
 * esforço leve, moderado e intenso (Requisito 6.2).
 *
 * Os percentuais vêm dos `ratio` já calculados pela seção de zonas — nada é
 * recalculado nem reinterpretado aqui. Grupos sem tempo algum não geram linha
 * (Requisito 6.3); no caso degenerado de uma série com um único instante (tempo
 * total zero, todos os `ratio` em `0`) nenhuma linha é gerada, que é a omissão
 * graciosa correta.
 */
function buildEffortRows(
  heartRateZones: ActivityBarSection | null,
): ActivityMetricRow[] {
  if (!heartRateZones) {
    return [];
  }

  const rows: ActivityMetricRow[] = [];

  for (const group of HEART_RATE_EFFORT_GROUPS) {
    const ratio = group.indexes.reduce(
      (total, index) => total + (heartRateZones.items[index]?.ratio ?? 0),
      0,
    );

    if (ratio > 0) {
      rows.push({ label: group.label, value: `${Math.round(ratio * 100)}%` });
    }
  }

  return rows;
}

/**
 * Linhas derivadas dos splits: quantidade de voltas/splits e a variação de
 * ritmo/velocidade, cadência e FC entre eles (Requisitos 4.3, 5.4, 6.2).
 *
 * Cada linha condicional respeita a categoria: ritmo só quando `rules.pace`,
 * velocidade só quando `rules.speedFallback` e cadência/frequência de braçadas só
 * quando `rules.cadenceOrStrokeRate` — mesmo que o lap traga o valor bruto
 * (Requisitos 4.6, 5.6, 6.6). A contagem de voltas é sempre exibida quando há
 * laps: é dado real do provider e independe da categoria.
 */
function buildSplitAnalysisRows(
  laps: readonly ParsedActivityLap[],
  rules: MetricDisplayRules,
): ActivityMetricRow[] {
  if (laps.length === 0) {
    return [];
  }

  const rows: ActivityMetricRow[] = [];
  const noun = usesLapVocabulary(rules) ? "voltas" : "splits";
  const push = (label: string, value: string | null) => {
    if (value !== null) {
      rows.push({ label, value });
    }
  };

  rows.push({
    label: usesLapVocabulary(rules) ? "Voltas registradas" : "Splits registrados",
    value: String(laps.length),
  });

  if (rules.pace) {
    const paceValues = laps
      .map((lap) => toPaceSeconds(lap.averageSpeed, rules.pace))
      .filter((value): value is number => value !== null);

    push(
      `Variação de ritmo entre ${noun}`,
      formatRange(paceValues, (value) => formatPaceByRules(value, rules.pace)),
    );
  } else if (rules.speedFallback) {
    push(
      `Variação de velocidade entre ${noun}`,
      formatRange(
        collectLapValues(laps, (lap) => lap.averageSpeed),
        (value) => formatSpeed(value * 3.6),
      ),
    );
  }

  if (rules.cadenceOrStrokeRate) {
    push(
      rules.cadenceOrStrokeRate === "stroke-rate"
        ? `Variação da frequência de braçadas entre ${noun}`
        : `Variação de cadência entre ${noun}`,
      formatRange(
        collectLapValues(laps, (lap) => lap.averageCadence),
        formatCadence,
      ),
    );
  }

  push(
    `Variação de FC entre ${noun}`,
    formatRange(
      collectLapValues(laps, (lap) => lap.averageHeartRate),
      formatHeartRate,
    ),
  );

  return rows;
}

/**
 * Linhas derivadas das séries do treino: a faixa percorrida por cada métrica ao
 * longo da atividade — a representação estrutural das séries admitida pelo
 * Requisito 6.2 (Requisitos 3.2, 4.3).
 *
 * O nível de análise da categoria decide quais séries entram:
 * `"full"` admite todas as séries que a categoria exibe; `"limited"` fica nas
 * séries de esforço mais velocidade (categorias que medem esforço por
 * velocidade); `"effort-only"` fica apenas nas séries de esforço (FC). A série de
 * FC não é condicionada à categoria (Requisito 3.1/3.2). A representação de
 * ritmo/pace ao longo do treino vem dos splits (Requisito 5.4), não daqui.
 */
function buildStreamAnalysisRows(
  streams: readonly ParsedActivityStream[],
  rules: MetricDisplayRules,
): ActivityMetricRow[] {
  const rows: ActivityMetricRow[] = [];
  const push = (label: string, value: string | null) => {
    if (value !== null) {
      rows.push({ label, value });
    }
  };

  push(
    "FC ao longo do treino",
    formatRange(collectStreamValues(streams, "heartrate"), formatHeartRate),
  );

  if (rules.cadenceOrStrokeRate && rules.workoutAnalysis === "full") {
    push(
      rules.cadenceOrStrokeRate === "stroke-rate"
        ? "Frequência de braçadas ao longo do treino"
        : "Cadência ao longo do treino",
      formatRange(collectStreamValues(streams, "cadence"), formatCadence),
    );
  }

  if (rules.speedFallback && rules.workoutAnalysis !== "effort-only") {
    push(
      "Velocidade ao longo do treino",
      formatRange(collectStreamValues(streams, "velocity_smooth"), (value) =>
        formatSpeed(value * 3.6),
      ),
    );
  }

  return rows;
}

/**
 * Monta a seção de análise do treino a partir das três fontes possíveis: zonas de
 * FC (calculadas), splits/voltas e séries do treino (Tarefa 17.3).
 *
 * A seção existe quando ao menos uma fonte contribui com conteúdo e contém
 * exatamente os sub-blocos correspondentes às fontes presentes — nunca um
 * sub-bloco de fonte ausente, nunca um sub-bloco vazio (Requisitos 6.1, 6.2, 6.3,
 * 6.4). Categorias sem análise do treino (`rules.workoutAnalysis === false`) não
 * exibem a seção de forma alguma, e o conteúdo dos sub-blocos respeita a
 * categoria (Requisito 6.6). Nunca lança.
 *
 * A seção de barras de zonas de FC continua sendo exibida à parte (em
 * `barSections`): o que entra aqui é a **leitura interpretativa** dela — o tempo
 * relativo em esforço leve/moderado/intenso.
 *
 * _Requisitos: 3.2, 4.3, 4.4, 4.6, 5.4, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
 */
function buildWorkoutAnalysisSection(args: {
  heartRateZones: ActivityBarSection | null;
  laps: readonly ParsedActivityLap[];
  streams: readonly ParsedActivityStream[];
  rules: MetricDisplayRules;
}): ActivityMetricSection | null {
  const { heartRateZones, laps, streams, rules } = args;

  if (!rules.workoutAnalysis) {
    return null;
  }

  const metrics = [
    ...buildEffortRows(heartRateZones),
    ...buildSplitAnalysisRows(laps, rules),
    ...buildStreamAnalysisRows(streams, rules),
  ];

  if (metrics.length === 0) {
    return null;
  }

  return {
    id: STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
    title: "Análise do treino",
    description:
      "Leitura do esforço da atividade a partir das zonas de frequência cardíaca, dos splits e das séries disponíveis.",
    metrics,
  };
}

/**
 * Enriquecedor de detalhe do Strava. Assinatura compatível com
 * `ActivityDetailEnricher` do registry de enriquecimento
 * (`(activity: Activity) => Promise<ActivityVisualData | null>`); o segundo
 * parâmetro é opcional e existe apenas para injeção em testes.
 *
 * NUNCA lança: qualquer falha de streams/laps (401/403/404/429/5xx/timeout/
 * payload inválido) resulta em omissão graciosa do bloco correspondente, não em
 * exceção propagada (Requisito 9.4). Devolve `null` quando não há nenhuma seção
 * rica a acrescentar — nesse caso o dispatcher exibe a visão base normalizada.
 *
 * _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 9.4, 10.1, 10.2, 10.4_
 */
export async function getStravaActivityVisualData(
  activity: Activity,
  options: GetStravaActivityVisualDataOptions = {},
): Promise<ActivityVisualData | null> {
  if (activity.provider !== "STRAVA") {
    return null;
  }

  const now = options.now ?? Date.now;
  const cacheKey = buildCacheKey(activity);
  const cached = stravaActivityVisualCache.get(cacheKey);

  if (cached && cached.expiresAt > now()) {
    return cached.value;
  }

  const sources = await loadStravaActivityDetailSources(activity, options);

  logIntegrationEvent("info", "Strava activity detail sources resolved", {
    provider: "STRAVA",
    operation: ENRICHMENT_OPERATION,
    status:
      sources.streams.length > 0 || sources.laps.length > 0 ? "ok" : "no_data",
    connectionId: activity.wearableConnectionId,
    streamCount: sources.streams.length,
    lapCount: sources.laps.length,
    hasHeartRateStream: sources.streams.some(
      (stream) => stream.type === "heartrate",
    ),
  });

  // Composição das seções ricas. Só entram na lista final os sub-blocos cujas
  // fontes existem — nunca seções vazias.
  const rules = resolveMetricDisplayRules(activity);
  const barSections: ActivityBarSection[] = [];
  const metricSections: ActivityMetricSection[] = [];

  const heartRateZones = buildHeartRateZonesSection(
    activity,
    sources.streams,
    rules,
  );

  if (heartRateZones) {
    barSections.push(heartRateZones);
  }

  const splits = buildSplitsSection(sources.laps, rules);

  if (splits) {
    barSections.push(splits);
  }

  const workoutAnalysis = buildWorkoutAnalysisSection({
    heartRateZones,
    laps: sources.laps,
    streams: sources.streams,
    rules,
  });

  if (workoutAnalysis) {
    metricSections.push(workoutAnalysis);
  }

  const hasRichSections = barSections.length > 0 || metricSections.length > 0;
  const visualData: ActivityVisualData | null = hasRichSections
    ? {
        // A visão base normalizada é o piso do detalhe enriquecido: o
        // enriquecedor SUBSTITUI o retorno do dispatcher, então precisa
        // carregar herói/resumo idênticos aos da visão base (que já resolve
        // rótulos e formatos pela categoria de exibição de métricas).
        ...buildBaseActivityVisualData(activity),
        barSections,
        metricSections,
      }
    : null;

  stravaActivityVisualCache.set(cacheKey, {
    expiresAt: now() + STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS,
    value: visualData,
  });

  return visualData;
}
