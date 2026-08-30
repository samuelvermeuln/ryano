/**
 * Refresh de token do Strava (OAuth 2.0) com rotação persistida e lock
 * anti-concorrência.
 *
 * Escopo desta camada (Task 5.4):
 *   1. Ler o refresh token cifrado da conexão (`WearableSecret`).
 *   2. `POST` no token URL com `grant_type=refresh_token`.
 *   3. Validar a resposta com Zod (schema reutilizado de `api/schemas`).
 *   4. Persistir o novo access token + o refresh token ROTACIONADO (quando o
 *      Strava devolve um novo) + o novo `accessTokenExpiresAt`.
 *   5. Impedir refresh concorrente para a mesma conexão (Req 10.5).
 *
 * NÃO faz parte desta camada: a rota/adapter de disconnect (Task 5.5), o client
 * de API (Task 6) — que consumirá `getValidStravaAccessToken` — nem o revoke
 * (`revoke.ts`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Confirmação na documentação oficial vigente do Strava
 * ([Strava Authentication](https://developers.strava.com/docs/authentication/)):
 *
 * - O refresh é um `POST` para o token URL (`getStravaConfig().oauth.tokenUrl`,
 *   default `https://www.strava.com/oauth/token`) com `client_id`,
 *   `client_secret`, `grant_type=refresh_token` e `refresh_token`.
 * - A resposta traz `token_type` (`Bearer`), `access_token`, `expires_at`
 *   (epoch em segundos), `expires_in` e `refresh_token`. NÃO traz `athlete`
 *   (por isso o schema mantém `athlete` opcional e reutilizável no refresh).
 * - ROTAÇÃO: o Strava pode (ou não) devolver um refresh token diferente do
 *   enviado. A aplicação DEVE persistir o refresh token vindo na resposta e
 *   sempre usar o mais recente; assim que um novo refresh token é retornado, o
 *   anterior é invalidado imediatamente.
 * - Access tokens expiram ~6h após criados. Ao chamar o endpoint de refresh, se
 *   o token ainda tem mais de 1h de validade o Strava devolve o mesmo token;
 *   caso contrário, emite um novo. Persistir a resposta sempre é seguro.
 *
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Lock anti-concorrência (Req 10.5) — abordagem e tradeoff
 *
 * Usamos um MUTEX EM PROCESSO por `connectionId` (um `Map<connectionId,
 * Promise>`). Quando um refresh já está em andamento para a mesma conexão, as
 * chamadas concorrentes aguardam e reaproveitam o MESMO resultado — ou seja,
 * duas chamadas simultâneas resultam em UM único refresh de rede e ambas
 * recebem o token fresco.
 *
 * Tradeoff: o mutex protege apenas dentro de UMA instância de runtime (um único
 * processo Node). Em um deploy multi-instância, dois processos poderiam
 * disparar refresh em paralelo. Como o Strava devolve o mesmo access token
 * quando ainda há >1h de validade, uma corrida entre instâncias raramente causa
 * dano, mas PODE, no pior caso, invalidar um refresh token recém-rotacionado se
 * as duas instâncias renovarem ao mesmo tempo com <1h de validade. Para
 * segurança cross-instância seria necessário um lock de curta duração no banco
 * (ex.: linha de lock / `SELECT ... FOR UPDATE` em transação). Optamos pelo
 * mutex em processo por simplicidade e por ser suficiente no cenário atual
 * (instância única); a migração para lock em banco é localizada nesta função.
 *
 * Segurança (Req 20.1/20.2): tokens são cifrados em repouso e nenhum log inclui
 * `client_secret`, `access_token` ou `refresh_token` — apenas metadados seguros.
 *
 * _Requisitos: 10.5, 20.1, 20.2_
 */

import { SecretType, WearableProvider } from "@prisma/client";

import { getStravaConfig } from "@/modules/strava/config";
import {
  stravaTokenResponseSchema,
  type StravaTokenResponse,
} from "@/modules/strava/api/schemas/strava-token-response";
import { prisma } from "@/server/db";
import { decryptSecret, encryptSecret } from "@/server/crypto/secret-vault";
import { incrementIntegrationMetric } from "@/modules/shared/integrations/observability";
import { logger } from "@/server/logging/logger";

/** Timeout padrão (ms) da requisição de refresh de token. */
export const DEFAULT_STRAVA_TOKEN_REFRESH_TIMEOUT_MS = 10_000;

/**
 * Margem de segurança (segundos) para considerar um access token "prestes a
 * expirar". Se o token expira dentro desta janela (ou já expirou / não tem data
 * conhecida), `getValidStravaAccessToken` dispara um refresh preventivo.
 *
 * Mantida pequena (5 min): o próprio Strava só emite um novo token quando resta
 * ≤1h de validade, então renovar dentro desta margem é seguro e barato.
 */
export const DEFAULT_STRAVA_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS = 300;

/** `grant_type` exigido pelo Strava no refresh de token. */
const REFRESH_TOKEN_GRANT = "refresh_token";

/**
 * Mutex em processo por `connectionId`. Guarda a promessa do refresh em curso
 * para coalescer chamadas concorrentes em uma única requisição de rede.
 */
const inFlightRefreshes = new Map<string, Promise<RefreshStravaTokenResult>>();

/** Seletor da conexão: por id direto OU por usuário (provider STRAVA). */
export type StravaConnectionSelector =
  | { connectionId: string; userId?: string }
  | { userId: string; connectionId?: undefined };

/** Parâmetros do refresh de token. */
export type RefreshStravaTokenInput = StravaConnectionSelector & {
  /** `fetch` injetável para testes (default: `fetch` global). */
  fetchImpl?: typeof fetch;
  /** Timeout da requisição (ms). */
  timeoutMs?: number;
};

/** Resultado do refresh de token. */
export interface RefreshStravaTokenResult {
  /** Id da `WearableConnection` (STRAVA) renovada. */
  connectionId: string;
  /** Access token fresco (em texto puro — não logar/persistir sem cifrar). */
  accessToken: string;
  /** Refresh token vigente após o refresh (rotacionado quando aplicável). */
  refreshToken: string;
  /** Expiração do access token (derivada de `expires_at`), ou `null`. */
  expiresAt: Date | null;
  /** `true` se o Strava devolveu um refresh token diferente do enviado. */
  rotated: boolean;
}

/**
 * Erro de refresh/leitura de token do Strava. Carrega um `code` estável para
 * observabilidade/tradução na UI, sem vazar segredos.
 */
export class StravaTokenRefreshError extends Error {
  readonly code: string;
  readonly httpStatus?: number;

  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "StravaTokenRefreshError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Converte `expires_at` (epoch em segundos) em `Date`, tolerando ausência. */
function expiresAtToDate(expiresAt: number | undefined): Date | null {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }

  return new Date(expiresAt * 1000);
}

/**
 * Resolve a `WearableConnection` (STRAVA) pelo seletor (por id ou por usuário).
 *
 * @throws {StravaTokenRefreshError} quando o seletor é inválido ou a conexão
 *   Strava não existe.
 */
async function resolveStravaConnection(selector: StravaConnectionSelector): Promise<{
  id: string;
  userId: string;
}> {
  if (selector.connectionId) {
    const connection = await prisma.wearableConnection.findUnique({
      where: { id: selector.connectionId },
      select: { id: true, userId: true, provider: true },
    });

    if (!connection || connection.provider !== WearableProvider.STRAVA) {
      throw new StravaTokenRefreshError(
        "STRAVA_CONNECTION_NOT_FOUND",
        "Conexão Strava não encontrada para o connectionId informado.",
      );
    }

    return { id: connection.id, userId: connection.userId };
  }

  if (selector.userId) {
    const connection = await prisma.wearableConnection.findUnique({
      where: {
        userId_provider: {
          userId: selector.userId,
          provider: WearableProvider.STRAVA,
        },
      },
      select: { id: true, userId: true },
    });

    if (!connection) {
      throw new StravaTokenRefreshError(
        "STRAVA_CONNECTION_NOT_FOUND",
        "Conexão Strava não encontrada para o usuário informado.",
      );
    }

    return { id: connection.id, userId: connection.userId };
  }

  throw new StravaTokenRefreshError(
    "STRAVA_TOKEN_REFRESH_INVALID_SELECTOR",
    "refreshStravaToken requer connectionId ou userId.",
  );
}

/** Lê e decifra um secret da conexão; retorna `null` se ausente. */
async function readConnectionSecret(
  connectionId: string,
  secretType: SecretType,
): Promise<string | null> {
  const secret = await prisma.wearableSecret.findUnique({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId: connectionId,
        secretType,
      },
    },
  });

  if (!secret) {
    return null;
  }

  return decryptSecret(secret);
}

/**
 * Faz o `POST` de refresh e valida a resposta com Zod.
 *
 * Nunca loga `client_secret`/tokens. Usa `AbortController` para timeout e
 * traduz falhas de rede/HTTP em `StravaTokenRefreshError` com `code` estável.
 */
async function requestStravaRefresh(input: {
  refreshToken: string;
  connectionId: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<StravaTokenResponse> {
  const config = getStravaConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new StravaTokenRefreshError(
      "STRAVA_OAUTH_ENV_MISSING",
      "Credenciais de OAuth do Strava ausentes (client id/secret).",
    );
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: REFRESH_TOKEN_GRANT,
    refresh_token: input.refreshToken,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  let response: Response;

  try {
    response = await input.fetchImpl(config.oauth.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";

    logger.error("Strava token refresh request failed", {
      provider: "STRAVA",
      operation: "token_refresh",
      connectionId: input.connectionId,
      status: aborted ? "timeout" : "network_error",
    });

    throw new StravaTokenRefreshError(
      aborted ? "STRAVA_TOKEN_REFRESH_TIMEOUT" : "STRAVA_TOKEN_REFRESH_NETWORK_ERROR",
      aborted
        ? "Tempo esgotado ao renovar o token no Strava."
        : "Falha de rede ao renovar o token no Strava.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logger.warn("Strava token refresh returned non-OK status", {
      provider: "STRAVA",
      operation: "token_refresh",
      connectionId: input.connectionId,
      status: "http_error",
      httpStatus: response.status,
    });

    throw new StravaTokenRefreshError(
      "STRAVA_TOKEN_REFRESH_HTTP_ERROR",
      `Strava respondeu com status ${response.status} no refresh de token.`,
      response.status,
    );
  }

  let json: unknown;

  try {
    json = await response.json();
  } catch {
    throw new StravaTokenRefreshError(
      "STRAVA_TOKEN_REFRESH_INVALID_JSON",
      "Resposta de refresh do Strava não é um JSON válido.",
    );
  }

  const parsed = stravaTokenResponseSchema.safeParse(json);

  if (!parsed.success) {
    logger.warn("Strava token refresh response failed schema validation", {
      provider: "STRAVA",
      operation: "token_refresh",
      connectionId: input.connectionId,
      status: "invalid_response",
    });

    throw new StravaTokenRefreshError(
      "STRAVA_TOKEN_REFRESH_INVALID_RESPONSE",
      "Resposta de refresh do Strava não passou na validação de schema.",
    );
  }

  return parsed.data;
}

/**
 * Persiste (transacionalmente) o resultado do refresh: novo access token, o
 * refresh token vigente (rotacionado quando aplicável) e `accessTokenExpiresAt`.
 */
async function persistRefreshedTokens(input: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}): Promise<void> {
  const encryptedAccessToken = encryptSecret(input.accessToken);
  const encryptedRefreshToken = encryptSecret(input.refreshToken);

  await prisma.$transaction(async (tx) => {
    await tx.wearableSecret.upsert({
      where: {
        wearableConnectionId_secretType: {
          wearableConnectionId: input.connectionId,
          secretType: SecretType.STRAVA_ACCESS_TOKEN,
        },
      },
      update: encryptedAccessToken,
      create: {
        wearableConnectionId: input.connectionId,
        secretType: SecretType.STRAVA_ACCESS_TOKEN,
        ...encryptedAccessToken,
      },
    });

    await tx.wearableSecret.upsert({
      where: {
        wearableConnectionId_secretType: {
          wearableConnectionId: input.connectionId,
          secretType: SecretType.STRAVA_REFRESH_TOKEN,
        },
      },
      update: encryptedRefreshToken,
      create: {
        wearableConnectionId: input.connectionId,
        secretType: SecretType.STRAVA_REFRESH_TOKEN,
        ...encryptedRefreshToken,
      },
    });

    // `accessTokenExpiresAt` vive em StravaConnectionDetails (1:1). O registro
    // deve existir (criado na troca inicial); usamos updateMany para ser
    // tolerantes caso ainda não exista (não falha o refresh por isso).
    await tx.stravaConnectionDetails.updateMany({
      where: { wearableConnectionId: input.connectionId },
      data: { accessTokenExpiresAt: input.expiresAt },
    });

    await tx.wearableConnection.update({
      where: { id: input.connectionId },
      data: {
        status: "CONNECTED",
        lastSyncStatus: "CONNECTED",
        lastErrorCode: null,
        lastSuccessAt: new Date(),
      },
    });
  });
}

/**
 * Executa o refresh de fato (sem o mutex — usado internamente pela versão com
 * lock). Lê o refresh token, chama o Strava, valida e persiste a rotação.
 */
async function doRefreshStravaToken(input: {
  connectionId: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<RefreshStravaTokenResult> {
  const currentRefreshToken = await readConnectionSecret(
    input.connectionId,
    SecretType.STRAVA_REFRESH_TOKEN,
  );

  if (!currentRefreshToken) {
    throw new StravaTokenRefreshError(
      "STRAVA_REFRESH_TOKEN_MISSING",
      "Refresh token do Strava ausente para a conexão.",
    );
  }

  const tokenResponse = await requestStravaRefresh({
    refreshToken: currentRefreshToken,
    connectionId: input.connectionId,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
  });

  const expiresAt = expiresAtToDate(tokenResponse.expires_at);
  const rotated = tokenResponse.refresh_token !== currentRefreshToken;

  await persistRefreshedTokens({
    connectionId: input.connectionId,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
  });

  logger.info("Strava access token refreshed", {
    provider: "STRAVA",
    operation: "token_refresh",
    connectionId: input.connectionId,
    status: "refreshed",
    rotated,
  });
  // Métrica rotulada por provider (Req 20.4): refresh de token executado.
  incrementIntegrationMetric({
    provider: "STRAVA",
    metric: "token_refresh",
    status: "refreshed",
  });

  return {
    connectionId: input.connectionId,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
    rotated,
  };
}

/**
 * Renova o access token do Strava para uma conexão, persistindo a rotação do
 * refresh token, com lock anti-concorrência por conexão (Req 10.5).
 *
 * Chamadas concorrentes para a MESMA conexão coalescem em um único refresh de
 * rede e todas recebem o token fresco (ver nota de tradeoff no topo do arquivo).
 *
 * @throws {StravaTokenRefreshError} em seletor inválido, conexão inexistente,
 *   refresh token ausente, env ausente, rede/timeout, HTTP não-OK ou
 *   JSON/schema inválido.
 */
export async function refreshStravaToken(
  input: RefreshStravaTokenInput,
): Promise<RefreshStravaTokenResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new StravaTokenRefreshError(
      "STRAVA_TOKEN_REFRESH_NO_FETCH",
      "Nenhuma implementação de fetch disponível para o refresh de token.",
    );
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_STRAVA_TOKEN_REFRESH_TIMEOUT_MS;
  const connection = await resolveStravaConnection(input);

  // Coalescência: se já há um refresh em curso para esta conexão, aguarda e
  // reaproveita o mesmo resultado (uma única chamada de rede).
  const existing = inFlightRefreshes.get(connection.id);

  if (existing) {
    return existing;
  }

  const refreshPromise = doRefreshStravaToken({
    connectionId: connection.id,
    fetchImpl,
    timeoutMs,
  }).finally(() => {
    inFlightRefreshes.delete(connection.id);
  });

  inFlightRefreshes.set(connection.id, refreshPromise);

  return refreshPromise;
}

/** Parâmetros de `getValidStravaAccessToken`. */
export type GetValidStravaAccessTokenInput = StravaConnectionSelector & {
  /** `fetch` injetável para testes (default: `fetch` global). */
  fetchImpl?: typeof fetch;
  /** Timeout da requisição de refresh (ms). */
  timeoutMs?: number;
  /**
   * Margem (segundos) para considerar o token "prestes a expirar" e renovar
   * preventivamente. Default: {@link DEFAULT_STRAVA_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS}.
   */
  expiryBufferSeconds?: number;
  /** Relógio injetável para testes (default: `Date.now`). */
  now?: () => number;
};

/** Resultado de `getValidStravaAccessToken`. */
export interface ValidStravaAccessToken {
  /** Id da conexão Strava. */
  connectionId: string;
  /** Access token válido (renovado se necessário). */
  accessToken: string;
  /** Expiração conhecida do access token, ou `null`. */
  expiresAt: Date | null;
  /** `true` se um refresh foi disparado para obter este token. */
  refreshed: boolean;
}

/**
 * Retorna um access token válido do Strava para a conexão, renovando-o quando
 * está expirado ou dentro da margem de expiração. Helper minimalista para o
 * client de API (Task 6) usar antes de cada requisição autenticada.
 *
 * Fluxo:
 *   1. Resolve a conexão e lê `accessTokenExpiresAt` + o access token cifrado.
 *   2. Se não há token, ou a expiração é desconhecida, ou está dentro da
 *      margem, chama `refreshStravaToken` (que já aplica o lock) e retorna o
 *      token fresco.
 *   3. Caso contrário, retorna o token atual sem tráfego de rede.
 */
export async function getValidStravaAccessToken(
  input: GetValidStravaAccessTokenInput,
): Promise<ValidStravaAccessToken> {
  const now = input.now ?? Date.now;
  const bufferSeconds =
    input.expiryBufferSeconds ?? DEFAULT_STRAVA_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS;

  const connection = await resolveStravaConnection(input);

  const details = await prisma.stravaConnectionDetails.findUnique({
    where: { wearableConnectionId: connection.id },
    select: { accessTokenExpiresAt: true },
  });

  const accessToken = await readConnectionSecret(
    connection.id,
    SecretType.STRAVA_ACCESS_TOKEN,
  );

  const expiresAt = details?.accessTokenExpiresAt ?? null;
  const expiresSoon =
    expiresAt === null || expiresAt.getTime() - now() <= bufferSeconds * 1000;

  if (!accessToken || expiresSoon) {
    const refreshed = await refreshStravaToken({
      connectionId: connection.id,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
    });

    return {
      connectionId: refreshed.connectionId,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      refreshed: true,
    };
  }

  return {
    connectionId: connection.id,
    accessToken,
    expiresAt,
    refreshed: false,
  };
}

/**
 * Helper de teste: limpa o mapa de refreshes em curso. Não deve ser usado em
 * produção — existe apenas para isolar cenários de concorrência nos testes.
 *
 * @internal
 */
export function __resetStravaRefreshLocksForTests(): void {
  inFlightRefreshes.clear();
}
