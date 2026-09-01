/**
 * Cliente HTTP do Strava (Task 6) — camada `api/client`.
 *
 * Encapsula TODA a comunicação autenticada com a API v3 do Strava, oferecendo
 * métodos tipados e validados por Zod ao restante do módulo (sync na Task 6.4,
 * webhook processor na Task 7). Nenhuma outra camada deve chamar a API do Strava
 * diretamente: o client concentra autenticação, refresh, rate limit, timeout,
 * parsing de erro e observabilidade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Endpoints confirmados na documentação oficial vigente do Strava
 * ([API Reference](https://developers.strava.com/docs/reference/) e
 * [Rate Limits](https://developers.strava.com/docs/rate-limits/) — conteúdo
 * PARAFRASEADO para conformidade com as restrições de licenciamento):
 *
 * - `GET /athlete/activities` ("List Athlete Activities"): lista as atividades do
 *   atleta autenticado. Aceita os filtros de query `before` e `after` (epoch em
 *   SEGUNDOS, sobre a data de início) e a paginação `page` + `per_page`
 *   (máximo de 200 itens por página). O fim dos resultados é sinalizado por uma
 *   página vazia — o backfill (Task 6.4) pagina até receber `[]`.
 * - `GET /activities/{id}` ("Get Activity"): retorna a `DetailedActivity` de uma
 *   atividade do próprio atleta (aceita `include_all_efforts` opcional).
 * - `GET /activities/{id}/streams` ("Get Activity Streams"): retorna o
 *   `StreamSet` da atividade. A doc lista `keys` (array de tipos de stream
 *   desejados) e `key_by_type` (booleano que a doc exige ser `true`) como
 *   parâmetros de query OBRIGATÓRIOS; exige o scope `activity:read`
 *   (`activity:read_all` para atividades marcadas como "Only Me"). Erros 4xx/5xx
 *   vêm no formato `Fault`, igual aos demais endpoints.
 * - `GET /activities/{id}/laps` ("List Activity Laps"): retorna um ARRAY de
 *   objetos `Lap` da atividade. O único parâmetro documentado é o `id` no path —
 *   NÃO existem parâmetros de query (nem paginação) para este endpoint. Exige o
 *   scope `activity:read` (`activity:read_all` para atividades marcadas como
 *   "Only Me"). Erros 4xx/5xx também vêm no formato `Fault`.
 * - Autenticação: toda chamada exige `Authorization: Bearer <access_token>`.
 * - Rate limit: o Strava devolve os headers `X-RateLimit-*`/`X-ReadRateLimit-*`
 *   em cada resposta e responde `429 Too Many Requests` ao estourar o limite.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Comportamentos-chave (Req 11.1, 11.5, 20.3, 20.4):
 *
 * 1. Autenticação com refresh automático: o token é obtido via
 *    `getValidStravaAccessToken` (Task 5.4), que renova preventivamente tokens
 *    prestes a expirar. Assim o caminho normal já usa um token válido.
 * 2. Retry em 401 (Req 11.5): se ainda assim o Strava responder `401`, o client
 *    FORÇA um refresh (`refreshStravaToken`) e RE-TENTA a requisição UMA única
 *    vez. Persistindo o 401, lança `StravaAuthError` (tipado).
 * 3. Backoff em 429: antes de cada requisição, reserva cota no rate limiter do
 *    módulo (`assertStravaRateLimit`); após cada resposta, sincroniza o limiter
 *    com os headers autoritativos (`updateStravaRateLimitFromHeaders`). Em `429`,
 *    calcula `retryAfterMs` (header `Retry-After` ou backoff do limiter) e lança
 *    `StravaRateLimitExceededError` (tipado) para o loop de sync tratar.
 * 4. Parsing de erro: corpos 4xx/5xx são parseados no DTO `Fault`
 *    (`stravaFaultSchema`) para observabilidade (sem vazar segredos).
 * 5. Validação de sucesso: os corpos 2xx são validados com os schemas Zod de
 *    `api/schemas` antes de atravessarem para o domínio.
 * 6. Timeout: cada requisição usa `AbortController` (configurável).
 * 7. Observabilidade: logs estruturados com
 *    `provider/operation/status/httpStatus/connectionId`. NUNCA loga
 *    tokens/secrets/PII.
 *
 * O `fetch` é injetável (`options.fetchImpl`) para testes offline (Task 6.5).
 *
 * _Requisitos: 11.1, 11.5, 20.3, 20.4_
 */

import { getStravaConfig } from "@/modules/strava/config";
import {
  getValidStravaAccessToken,
  refreshStravaToken,
} from "@/modules/strava/auth";
import {
  stravaDetailedActivitySchema,
  stravaFaultSchema,
  stravaLapListSchema,
  stravaStreamSetObjectSchema,
  stravaSummaryActivityListSchema,
} from "@/modules/strava/api/schemas";
import type {
  StravaDetailedActivityDto,
  StravaFaultDto,
  StravaLapDto,
  StravaStreamSetObjectDto,
  StravaSummaryActivityDto,
} from "@/modules/strava/api/dto";
import {
  assertStravaRateLimit,
  getStravaRateLimitBackoff,
  StravaRateLimitError,
  updateStravaRateLimitFromHeaders,
} from "@/modules/strava/infrastructure/rate-limit";
import type { StravaRequestKind } from "@/modules/strava/infrastructure/rate-limit";
import { incrementIntegrationMetric } from "@/modules/shared/integrations/observability";
import { logger } from "@/server/logging/logger";
import type { ZodType } from "zod";

/** Timeout padrão (ms) de cada requisição à API do Strava. */
export const DEFAULT_STRAVA_CLIENT_TIMEOUT_MS = 15_000;

/** Máximo de itens por página aceito pelo Strava em `GET /athlete/activities`. */
export const STRAVA_MAX_ACTIVITIES_PER_PAGE = 200;

/**
 * Contexto de uma chamada do client: identifica a conexão Strava sobre a qual a
 * operação atua. Aceita `connectionId` (preferido) e/ou `userId`; ao menos um é
 * obrigatório. Alinha-se ao `ProviderContext` do core (subset com o necessário
 * para resolver o token), sem acoplar o client ao acessor de secrets.
 */
export type StravaClientContext =
  | { connectionId: string; userId?: string }
  | { userId: string; connectionId?: string };

/** Parâmetros de `listAthleteActivities` (mapeiam para a query do Strava). */
export interface ListAthleteActivitiesParams {
  /** Somente atividades iniciadas ANTES deste instante (epoch em segundos). */
  before?: number;
  /** Somente atividades iniciadas APÓS este instante (epoch em segundos). */
  after?: number;
  /** Página (1-based). */
  page?: number;
  /** Itens por página (limitado a {@link STRAVA_MAX_ACTIVITIES_PER_PAGE}). */
  perPage?: number;
}

/** Parâmetros de `getActivityStreams` (mapeiam para a query do Strava). */
export interface GetActivityStreamsParams {
  /**
   * Tipos de stream desejados (ex.:
   * `["time", "heartrate", "cadence", "distance", "velocity_smooth"]`).
   * Serializados como lista separada por vírgula em `keys`. Obrigatório pela
   * doc oficial — uma lista vazia é rejeitada localmente, sem gastar cota.
   */
  keys: readonly string[];
}

/** Opções de construção do client. */
export interface StravaClientOptions {
  /** `fetch` injetável para testes (default: `fetch` global). */
  fetchImpl?: typeof fetch;
  /** Timeout por requisição (ms). Default {@link DEFAULT_STRAVA_CLIENT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Base URL da API (default: `getStravaConfig().apiBaseUrl`). */
  baseUrl?: string;
}

/**
 * Erro base do client do Strava. Carrega `code` estável + metadados seguros
 * (httpStatus/connectionId/operation) para observabilidade e tradução na UI,
 * sem NUNCA embutir tokens/secrets.
 */
export class StravaClientError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly connectionId?: string;
  readonly operation?: string;
  /** `Fault` parseado do corpo de erro (quando disponível). */
  readonly fault?: StravaFaultDto;

  constructor(params: {
    code: string;
    message: string;
    httpStatus?: number;
    connectionId?: string;
    operation?: string;
    fault?: StravaFaultDto;
  }) {
    super(params.message);
    this.name = "StravaClientError";
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.connectionId = params.connectionId;
    this.operation = params.operation;
    this.fault = params.fault;
    Object.setPrototypeOf(this, StravaClientError.prototype);
  }
}

/**
 * Erro de autenticação: o Strava respondeu `401` mesmo após um refresh forçado
 * e um retry (Req 11.5). Sinaliza que a conexão precisa ser reautorizada.
 */
export class StravaAuthError extends StravaClientError {
  constructor(params: {
    message: string;
    connectionId?: string;
    operation?: string;
    fault?: StravaFaultDto;
  }) {
    super({ code: "STRAVA_UNAUTHORIZED", httpStatus: 401, ...params });
    this.name = "StravaAuthError";
    Object.setPrototypeOf(this, StravaAuthError.prototype);
  }
}

/**
 * Erro de rate limit REMOTO: o Strava respondeu `429`. Carrega `retryAfterMs`
 * (do header `Retry-After` ou do backoff do limiter) para o loop de sync
 * aguardar antes de tentar de novo, em vez de martelar a API.
 */
export class StravaRateLimitExceededError extends StravaClientError {
  readonly retryAfterMs: number;

  constructor(params: {
    retryAfterMs: number;
    connectionId?: string;
    operation?: string;
    fault?: StravaFaultDto;
  }) {
    super({
      code: "STRAVA_RATE_LIMITED",
      httpStatus: 429,
      message: `Strava respondeu 429 (rate limit); retry em ${params.retryAfterMs}ms`,
      connectionId: params.connectionId,
      operation: params.operation,
      fault: params.fault,
    });
    this.name = "StravaRateLimitExceededError";
    this.retryAfterMs = params.retryAfterMs;
    Object.setPrototypeOf(this, StravaRateLimitExceededError.prototype);
  }
}

/** Extrai o `connectionId` do contexto, quando presente diretamente. */
function contextConnectionId(ctx: StravaClientContext): string | undefined {
  return ctx.connectionId;
}

/** Converte o contexto do client no seletor aceito pela camada de auth. */
function toSelector(
  ctx: StravaClientContext,
): { connectionId: string; userId?: string } | { userId: string } {
  if (ctx.connectionId) {
    return { connectionId: ctx.connectionId, userId: ctx.userId };
  }
  // `userId` garantido pelo tipo quando `connectionId` está ausente.
  return { userId: ctx.userId as string };
}

/** Lê o header `Retry-After` (segundos) e converte para ms, se presente/válido. */
function retryAfterMsFromHeaders(headers: Headers): number | undefined {
  const raw = headers.get("Retry-After");
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return Math.ceil(seconds * 1000);
}

/** Tenta parsear o corpo de erro no DTO `Fault` (tolerante a corpos não-JSON). */
async function parseFault(response: Response): Promise<StravaFaultDto | undefined> {
  try {
    const json = await response.clone().json();
    const parsed = stravaFaultSchema.safeParse(json);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cliente da API v3 do Strava.
 *
 * Instâncias são baratas e reutilizáveis. O rate limiter e o estado de token são
 * compartilhados via singletons/DB do módulo, então múltiplas instâncias
 * coexistem sem duplicar cota. Use {@link createStravaClient} como fábrica.
 */
export class StravaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: StravaClientOptions = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new StravaClientError({
        code: "STRAVA_CLIENT_NO_FETCH",
        message: "Nenhuma implementação de fetch disponível para o StravaClient.",
      });
    }
    this.fetchImpl = fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_STRAVA_CLIENT_TIMEOUT_MS;
    this.baseUrl = (options.baseUrl ?? getStravaConfig().apiBaseUrl).replace(/\/+$/, "");
  }

  /**
   * Lista as atividades-resumo do atleta autenticado
   * (`GET /athlete/activities`). Usado no backfill/sync (Task 6.4): pagine com
   * `page`/`perPage` e filtre a janela com `after`/`before` (epoch em segundos).
   *
   * @returns lista validada de `StravaSummaryActivityDto` (pode ser vazia — fim
   *   da paginação).
   */
  async listAthleteActivities(
    ctx: StravaClientContext,
    params: ListAthleteActivitiesParams = {},
  ): Promise<StravaSummaryActivityDto[]> {
    const query = new URLSearchParams();
    if (typeof params.before === "number") {
      query.set("before", String(Math.floor(params.before)));
    }
    if (typeof params.after === "number") {
      query.set("after", String(Math.floor(params.after)));
    }
    if (typeof params.page === "number") {
      query.set("page", String(Math.max(1, Math.floor(params.page))));
    }
    if (typeof params.perPage === "number") {
      const perPage = Math.min(
        STRAVA_MAX_ACTIVITIES_PER_PAGE,
        Math.max(1, Math.floor(params.perPage)),
      );
      query.set("per_page", String(perPage));
    }

    return this.request(ctx, {
      operation: "list_activities",
      path: "/athlete/activities",
      query,
      schema: stravaSummaryActivityListSchema,
    });
  }

  /**
   * Obtém a atividade detalhada pelo id (`GET /activities/{id}`). Usado pelo
   * processor de webhook (Task 7) e por enriquecimento de detalhe.
   *
   * @returns `StravaDetailedActivityDto` validado.
   */
  async getActivityById(
    ctx: StravaClientContext,
    id: string | number,
  ): Promise<StravaDetailedActivityDto> {
    const activityId = String(id).trim();
    if (!activityId) {
      throw new StravaClientError({
        code: "STRAVA_CLIENT_INVALID_ACTIVITY_ID",
        message: "getActivityById requer um id de atividade não-vazio.",
        connectionId: contextConnectionId(ctx),
        operation: "get_activity",
      });
    }

    return this.request(ctx, {
      operation: "get_activity",
      path: `/activities/${encodeURIComponent(activityId)}`,
      schema: stravaDetailedActivitySchema,
    });
  }

  /**
   * Obtém os streams de uma atividade
   * (`GET /activities/{id}/streams?keys=...&key_by_type=true`).
   *
   * `key_by_type` é FIXADO em `true` (a doc oficial exige esse valor), então a
   * resposta é sempre o `StreamSet` na forma indexada por tipo — validada com
   * `stravaStreamSetObjectSchema`. Streams que a atividade não possui
   * simplesmente não aparecem no objeto retornado (nenhum deles é obrigatório),
   * cabendo ao chamador tratar a ausência.
   *
   * Reusa o `request()` compartilhado: mesmo refresh/retry único em 401, backoff
   * em 429, parsing de `Fault`, timeout e logging estruturado dos demais métodos
   * (nenhum caminho de autenticação paralelo).
   *
   * @returns `StravaStreamSetObjectDto` validado.
   */
  async getActivityStreams(
    ctx: StravaClientContext,
    id: string | number,
    params: GetActivityStreamsParams,
  ): Promise<StravaStreamSetObjectDto> {
    const activityId = String(id).trim();
    if (!activityId) {
      throw new StravaClientError({
        code: "STRAVA_CLIENT_INVALID_ACTIVITY_ID",
        message: "getActivityStreams requer um id de atividade não-vazio.",
        connectionId: contextConnectionId(ctx),
        operation: "get_activity_streams",
      });
    }

    // Normaliza os `keys`: descarta vazios/duplicados preservando a ordem.
    const keys = [
      ...new Set(params.keys.map((key) => key.trim()).filter(Boolean)),
    ];
    if (keys.length === 0) {
      throw new StravaClientError({
        code: "STRAVA_CLIENT_INVALID_STREAM_KEYS",
        message: "getActivityStreams requer ao menos um tipo de stream em `keys`.",
        connectionId: contextConnectionId(ctx),
        operation: "get_activity_streams",
      });
    }

    const query = new URLSearchParams();
    query.set("keys", keys.join(","));
    query.set("key_by_type", "true");

    return this.request(ctx, {
      operation: "get_activity_streams",
      path: `/activities/${encodeURIComponent(activityId)}/streams`,
      query,
      schema: stravaStreamSetObjectSchema,
    });
  }

  /**
   * Obtém as voltas de uma atividade (`GET /activities/{id}/laps`).
   *
   * A doc oficial documenta APENAS o `id` no path — o endpoint não aceita query
   * params nem paginação, então a chamada não monta `URLSearchParams`. A resposta
   * é um ARRAY de `Lap`, validado com `stravaLapListSchema` (schema já existente
   * em `api/schemas/strava-lap.ts`; nenhum schema novo é introduzido).
   *
   * Uma atividade sem voltas registradas devolve uma lista vazia — isso é
   * ausência de dado, não erro, e cabe ao chamador tratar.
   *
   * Reusa o `request()` compartilhado: mesmo refresh/retry único em 401, backoff
   * em 429, parsing de `Fault`, timeout e logging estruturado dos demais métodos
   * (nenhum caminho de autenticação paralelo).
   *
   * @returns lista validada de `StravaLapDto` (pode ser vazia).
   */
  async getActivityLaps(
    ctx: StravaClientContext,
    id: string | number,
  ): Promise<StravaLapDto[]> {
    const activityId = String(id).trim();
    if (!activityId) {
      throw new StravaClientError({
        code: "STRAVA_CLIENT_INVALID_ACTIVITY_ID",
        message: "getActivityLaps requer um id de atividade não-vazio.",
        connectionId: contextConnectionId(ctx),
        operation: "get_activity_laps",
      });
    }

    return this.request(ctx, {
      operation: "get_activity_laps",
      path: `/activities/${encodeURIComponent(activityId)}/laps`,
      schema: stravaLapListSchema,
    });
  }

  /**
   * Núcleo compartilhado: autentica, reserva cota, executa a requisição com
   * timeout, aplica o retry único em 401 (Req 11.5), o backoff em 429, o parsing
   * de erro e a validação de schema. Sempre sincroniza o rate limiter com os
   * headers de cada resposta.
   */
  private async request<T>(
    ctx: StravaClientContext,
    args: {
      operation: string;
      path: string;
      query?: URLSearchParams;
      schema: ZodType<T>;
      kind?: StravaRequestKind;
    },
  ): Promise<T> {
    const kind = args.kind ?? "read";
    const url = this.buildUrl(args.path, args.query);

    // 1. Token válido (refresh preventivo embutido).
    let token = await getValidStravaAccessToken({
      ...toSelector(ctx),
      fetchImpl: this.fetchImpl,
    });
    const connectionId = token.connectionId;

    // 2. Primeira tentativa.
    let response = await this.doFetch({
      url,
      accessToken: token.accessToken,
      connectionId,
      operation: args.operation,
    });

    // 3. Retry único em 401 após refresh forçado (Req 11.5).
    if (response.status === 401) {
      logger.warn("Strava API responded 401; forcing token refresh and retrying", {
        provider: "STRAVA",
        operation: args.operation,
        connectionId,
        status: "unauthorized_retry",
        httpStatus: 401,
      });

      const refreshed = await refreshStravaToken({
        connectionId,
        fetchImpl: this.fetchImpl,
      });
      token = {
        connectionId: refreshed.connectionId,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        refreshed: true,
      };

      response = await this.doFetch({
        url,
        accessToken: token.accessToken,
        connectionId,
        operation: args.operation,
      });

      if (response.status === 401) {
        const fault = await parseFault(response);
        logger.error("Strava API still 401 after refresh; connection needs reauth", {
          provider: "STRAVA",
          operation: args.operation,
          connectionId,
          status: "unauthorized",
          httpStatus: 401,
        });
        incrementIntegrationMetric({
          provider: "STRAVA",
          metric: "error",
          status: "unauthorized",
        });
        throw new StravaAuthError({
          message: "Strava respondeu 401 mesmo após refresh do token.",
          connectionId,
          operation: args.operation,
          fault,
        });
      }
    }

    // 4. Rate limit remoto (429): calcula retryAfter e lança erro tipado.
    if (response.status === 429) {
      const fault = await parseFault(response);
      const headerRetry = retryAfterMsFromHeaders(response.headers);
      const backoff = getStravaRateLimitBackoff(kind);
      const retryAfterMs =
        headerRetry ?? (backoff.blocked ? backoff.retryAfterMs : 60_000);

      logger.warn("Strava API responded 429 (rate limited)", {
        provider: "STRAVA",
        operation: args.operation,
        connectionId,
        status: "rate_limited",
        httpStatus: 429,
        retryAfterMs,
      });
      incrementIntegrationMetric({
        provider: "STRAVA",
        metric: "error",
        status: "rate_limited",
      });

      throw new StravaRateLimitExceededError({
        retryAfterMs,
        connectionId,
        operation: args.operation,
        fault,
      });
    }

    // 5. Outros erros HTTP: parseia Fault e lança erro tipado.
    if (!response.ok) {
      const fault = await parseFault(response);
      logger.error("Strava API returned error status", {
        provider: "STRAVA",
        operation: args.operation,
        connectionId,
        status: "http_error",
        httpStatus: response.status,
      });
      incrementIntegrationMetric({
        provider: "STRAVA",
        metric: "error",
        status: "http_error",
      });
      throw new StravaClientError({
        code: "STRAVA_HTTP_ERROR",
        message: `Strava respondeu status ${response.status} em ${args.operation}.`,
        httpStatus: response.status,
        connectionId,
        operation: args.operation,
        fault,
      });
    }

    // 6. Corpo de sucesso: parseia JSON e valida com Zod.
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new StravaClientError({
        code: "STRAVA_INVALID_JSON",
        message: `Resposta do Strava em ${args.operation} não é JSON válido.`,
        httpStatus: response.status,
        connectionId,
        operation: args.operation,
      });
    }

    const parsed = args.schema.safeParse(json);
    if (!parsed.success) {
      logger.warn("Strava API response failed schema validation", {
        provider: "STRAVA",
        operation: args.operation,
        connectionId,
        status: "invalid_response",
        httpStatus: response.status,
      });
      throw new StravaClientError({
        code: "STRAVA_INVALID_RESPONSE",
        message: `Resposta do Strava em ${args.operation} não passou na validação de schema.`,
        httpStatus: response.status,
        connectionId,
        operation: args.operation,
      });
    }

    logger.info("Strava API request succeeded", {
      provider: "STRAVA",
      operation: args.operation,
      connectionId,
      status: "ok",
      httpStatus: response.status,
    });
    // Métrica rotulada por provider (Req 20.4): requisição concluída com sucesso.
    incrementIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" });

    return parsed.data;
  }

  /** Monta a URL absoluta a partir da base + path + query. */
  private buildUrl(path: string, query?: URLSearchParams): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const search = query && [...query.keys()].length ? `?${query.toString()}` : "";
    return `${this.baseUrl}${normalizedPath}${search}`;
  }

  /**
   * Executa UMA requisição de rede: reserva cota no limiter (pode lançar
   * `StravaRateLimitError` local), aplica o timeout via `AbortController`,
   * envia o Bearer e sincroniza o limiter com os headers da resposta.
   *
   * Retorna o `Response` cru (o tratamento de status fica no `request`).
   */
  private async doFetch(args: {
    url: string;
    accessToken: string;
    connectionId: string;
    operation: string;
    kind?: StravaRequestKind;
  }): Promise<Response> {
    // Reserva cota ANTES da requisição (Req 11.7 / backoff em 429). Lança
    // StravaRateLimitError (local) quando estouraria — o sync loop trata.
    assertStravaRateLimit(args.kind ?? "read");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(args.url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      logger.error("Strava API request failed at network layer", {
        provider: "STRAVA",
        operation: args.operation,
        connectionId: args.connectionId,
        status: aborted ? "timeout" : "network_error",
      });
      incrementIntegrationMetric({
        provider: "STRAVA",
        metric: "error",
        status: aborted ? "timeout" : "network_error",
      });
      throw new StravaClientError({
        code: aborted ? "STRAVA_CLIENT_TIMEOUT" : "STRAVA_CLIENT_NETWORK_ERROR",
        message: aborted
          ? `Tempo esgotado ao chamar o Strava (${args.operation}).`
          : `Falha de rede ao chamar o Strava (${args.operation}).`,
        connectionId: args.connectionId,
        operation: args.operation,
      });
    } finally {
      clearTimeout(timeout);
    }

    // Sincroniza o limiter com o uso AUTORITATIVO reportado pelo Strava.
    try {
      updateStravaRateLimitFromHeaders(response.headers);
    } catch {
      // Nunca deixa a sincronização de headers quebrar o fluxo do client.
    }

    return response;
  }
}

/** Fábrica do client do Strava (preferida a `new StravaClient`). */
export function createStravaClient(options: StravaClientOptions = {}): StravaClient {
  return new StravaClient(options);
}

// Reexporta o erro do limiter local para o sync loop tratar junto com o 429.
export { StravaRateLimitError };
