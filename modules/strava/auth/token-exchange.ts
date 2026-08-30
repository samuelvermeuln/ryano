/**
 * Troca de código de autorização por token do Strava (OAuth 2.0) e persistência
 * da conexão.
 *
 * Escopo desta camada (Task 5.3):
 *   1. `POST` no token URL trocando o `code` por tokens.
 *   2. Validação da resposta com Zod (schema em `api/schemas`).
 *   3. Extração de `athlete.id`, scopes concedidos, `expires_at`, tokens.
 *   4. Persistência transacional: `WearableConnection` (STRAVA) +
 *      `StravaConnectionDetails` + secrets criptografados (`WearableSecret`).
 *
 * NÃO faz parte desta camada: a rota/adapter do callback (Task 5.5, valida o
 * `state` e chama esta função), refresh/revoke (Task 5.4) e o backfill/sync
 * inicial (Task 6.4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Confirmação na documentação oficial vigente do Strava
 * ([Strava Authentication](https://developers.strava.com/docs/authentication/)):
 *
 * - A troca é um `POST` para o token URL (`getStravaConfig().oauth.tokenUrl`)
 *   com `client_id`, `client_secret`, `code` e `grant_type=authorization_code`.
 * - A resposta traz `token_type` (`Bearer`), `access_token`, `refresh_token`,
 *   `expires_at` (epoch em segundos) e `expires_in`, além do `athlete`
 *   (com `id` numérico) na troca inicial.
 * - Os scopes de fato concedidos NÃO vêm no corpo do token: eles retornam como
 *   parâmetro de query `scope` no callback (separados por vírgula). Por isso a
 *   função recebe o `scope` do callback e persiste exatamente o que foi
 *   concedido (Req 10.4 — scope parcial). O usuário pode ter negado scopes.
 *
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Segurança (Req 20.1/20.2): os tokens são cifrados em repouso via cofre de
 * secrets (AES-256-GCM) e persistidos em `WearableSecret`. Nenhum log inclui
 * `code`, `client_secret`, `access_token` ou `refresh_token` — apenas metadados
 * seguros (provider/operação/status/athleteId/scopes).
 *
 * _Requisitos: 10.3, 10.4, 6.2, 6.4, 20.1, 20.2_
 */

import { SecretType, WearableProvider } from "@prisma/client";

import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import { getStravaConfig } from "@/modules/strava/config";
import {
  stravaTokenResponseSchema,
  type StravaTokenResponse,
} from "@/modules/strava/api/schemas/strava-token-response";
import { prisma } from "@/server/db";
import { encryptSecret } from "@/server/crypto/secret-vault";
import { logger } from "@/server/logging/logger";

/** Timeout padrão (ms) da requisição de troca de token. */
export const DEFAULT_STRAVA_TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;

/** `grant_type` exigido pelo Strava na troca de código por token. */
const AUTHORIZATION_CODE_GRANT = "authorization_code";

/** Parâmetros da troca de código por token. */
export interface ExchangeStravaCodeInput {
  /** Usuário que está conectando a conta Strava. */
  userId: string;
  /** `code` de autorização retornado pelo Strava no callback. */
  code: string;
  /**
   * String bruta de `scope` retornada no callback (lista separada por vírgula,
   * ex.: `"read,activity:read_all"`). É a fonte autoritativa dos scopes de fato
   * concedidos (Req 10.4). Opcional: se ausente, tentamos o `scope` do corpo do
   * token (raro) e, por fim, uma lista vazia.
   */
  scope?: string | null;
  /** `fetch` injetável para testes (default: `fetch` global). */
  fetchImpl?: typeof fetch;
  /** Timeout da requisição (ms). */
  timeoutMs?: number;
}

/** Resultado da troca de código por token. */
export interface ExchangeStravaCodeResult {
  /** Id da `WearableConnection` (STRAVA) persistida. */
  connectionId: string;
  /** Id do atleta Strava (externalAccountId). */
  athleteId: string;
  /** Scopes de fato concedidos, normalizados. */
  scopes: string[];
  /** Expiração do access token (derivada de `expires_at`), ou `null`. */
  expiresAt: Date | null;
}

/**
 * Erro de troca de token do Strava. Carrega um `code` estável para
 * observabilidade/tradução na UI, sem vazar segredos.
 */
export class StravaTokenExchangeError extends Error {
  readonly code: string;
  readonly httpStatus?: number;

  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "StravaTokenExchangeError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Normaliza a string de scopes concedidos em uma lista limpa e sem duplicatas.
 *
 * O Strava devolve os scopes concedidos no callback separados por vírgula, mas
 * aceitamos também separação por espaço (tolerância defensiva). Vazios são
 * descartados; a ordem de primeira ocorrência é preservada.
 */
export function normalizeStravaScopes(rawScope: string | null | undefined): string[] {
  if (!rawScope || typeof rawScope !== "string") {
    return [];
  }

  const seen = new Set<string>();
  const scopes: string[] = [];

  for (const part of rawScope.split(/[\s,]+/)) {
    const scope = part.trim();

    if (scope !== "" && !seen.has(scope)) {
      seen.add(scope);
      scopes.push(scope);
    }
  }

  return scopes;
}

/**
 * Deriva as capabilities habilitadas do provider (chaves com valor `true`) a
 * partir do catálogo central. Persistidas em `WearableConnection.capabilities`
 * para refletir o que a conexão pode fazer, sem hardcode espalhado.
 */
function getStravaConnectionCapabilities(): string[] {
  const definition = getProviderDefinition("STRAVA");

  if (!definition) {
    return ["activities"];
  }

  const capabilities = definition.capabilities as ProviderCapabilities;

  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([capability]) => capability);
}

/** Converte `expires_at` (epoch em segundos) em `Date`, tolerando ausência. */
function expiresAtToDate(expiresAt: number | undefined): Date | null {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }

  return new Date(expiresAt * 1000);
}

/**
 * Faz o `POST` de troca de código por token e valida a resposta com Zod.
 *
 * Nunca loga `code`/`client_secret`/tokens. Usa `AbortController` para timeout e
 * traduz falhas de rede/HTTP em `StravaTokenExchangeError` com `code` estável.
 */
async function requestStravaToken(input: {
  code: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<StravaTokenResponse> {
  const config = getStravaConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new StravaTokenExchangeError(
      "STRAVA_OAUTH_ENV_MISSING",
      "Credenciais de OAuth do Strava ausentes (client id/secret).",
    );
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: AUTHORIZATION_CODE_GRANT,
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

    // Nunca inclui code/secret/tokens no log.
    logger.error("Strava token exchange request failed", {
      provider: "STRAVA",
      operation: "token_exchange",
      status: aborted ? "timeout" : "network_error",
    });

    throw new StravaTokenExchangeError(
      aborted ? "STRAVA_TOKEN_EXCHANGE_TIMEOUT" : "STRAVA_TOKEN_EXCHANGE_NETWORK_ERROR",
      aborted
        ? "Tempo esgotado ao trocar o código por token no Strava."
        : "Falha de rede ao trocar o código por token no Strava.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logger.warn("Strava token exchange returned non-OK status", {
      provider: "STRAVA",
      operation: "token_exchange",
      status: "http_error",
      httpStatus: response.status,
    });

    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_HTTP_ERROR",
      `Strava respondeu com status ${response.status} na troca de token.`,
      response.status,
    );
  }

  let json: unknown;

  try {
    json = await response.json();
  } catch {
    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_INVALID_JSON",
      "Resposta de token do Strava não é um JSON válido.",
    );
  }

  const parsed = stravaTokenResponseSchema.safeParse(json);

  if (!parsed.success) {
    // Loga apenas que a validação falhou (sem o corpo, que contém tokens).
    logger.warn("Strava token exchange response failed schema validation", {
      provider: "STRAVA",
      operation: "token_exchange",
      status: "invalid_response",
    });

    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_INVALID_RESPONSE",
      "Resposta de token do Strava não passou na validação de schema.",
    );
  }

  return parsed.data;
}

/**
 * Persiste (transacionalmente) a conexão Strava, seus detalhes e os secrets
 * criptografados.
 *
 * - `WearableConnection` (unique `userId_provider`): status CONNECTED,
 *   `externalAccountId = athleteId`, capabilities do catálogo, e timestamps de
 *   saúde (`lastSyncAt`/`lastSuccessAt`/`lastEventAt`).
 * - `StravaConnectionDetails` (1:1): `athleteId`, `scopes`, `accessTokenExpiresAt`.
 * - `WearableSecret`: `STRAVA_ACCESS_TOKEN` e `STRAVA_REFRESH_TOKEN` cifrados.
 */
async function persistStravaConnection(input: {
  userId: string;
  athleteId: string;
  scopes: string[];
  expiresAt: Date | null;
  accessToken: string;
  refreshToken: string;
}): Promise<{ connectionId: string }> {
  const capabilities = getStravaConnectionCapabilities();
  const encryptedAccessToken = encryptSecret(input.accessToken);
  const encryptedRefreshToken = encryptSecret(input.refreshToken);

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const connection = await tx.wearableConnection.upsert({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: WearableProvider.STRAVA,
        },
      },
      update: {
        externalAccountId: input.athleteId,
        status: "CONNECTED",
        capabilities,
        lastSyncStatus: "CONNECTED",
        lastErrorCode: null,
        lastSuccessAt: now,
        lastEventAt: now,
      },
      create: {
        userId: input.userId,
        provider: WearableProvider.STRAVA,
        externalAccountId: input.athleteId,
        status: "CONNECTED",
        capabilities,
        lastSyncStatus: "CONNECTED",
        lastSuccessAt: now,
        lastEventAt: now,
      },
    });

    await tx.stravaConnectionDetails.upsert({
      where: { wearableConnectionId: connection.id },
      update: {
        athleteId: input.athleteId,
        scopes: input.scopes,
        accessTokenExpiresAt: input.expiresAt,
      },
      create: {
        wearableConnectionId: connection.id,
        athleteId: input.athleteId,
        scopes: input.scopes,
        accessTokenExpiresAt: input.expiresAt,
      },
    });

    await tx.wearableSecret.upsert({
      where: {
        wearableConnectionId_secretType: {
          wearableConnectionId: connection.id,
          secretType: SecretType.STRAVA_ACCESS_TOKEN,
        },
      },
      update: encryptedAccessToken,
      create: {
        wearableConnectionId: connection.id,
        secretType: SecretType.STRAVA_ACCESS_TOKEN,
        ...encryptedAccessToken,
      },
    });

    await tx.wearableSecret.upsert({
      where: {
        wearableConnectionId_secretType: {
          wearableConnectionId: connection.id,
          secretType: SecretType.STRAVA_REFRESH_TOKEN,
        },
      },
      update: encryptedRefreshToken,
      create: {
        wearableConnectionId: connection.id,
        secretType: SecretType.STRAVA_REFRESH_TOKEN,
        ...encryptedRefreshToken,
      },
    });

    return { connectionId: connection.id };
  });
}

/**
 * Troca o `code` de autorização do Strava por tokens e persiste a conexão.
 *
 * Fluxo:
 *   1. `POST` no token URL (`grant_type=authorization_code`).
 *   2. Valida a resposta (Zod) e exige `athlete.id`.
 *   3. Deriva os scopes concedidos do callback (Req 10.4).
 *   4. Persiste conexão + detalhes + secrets cifrados em transação.
 *
 * @throws {StravaTokenExchangeError} em erro de env, rede, timeout, HTTP não-OK,
 *   JSON/schema inválido ou ausência do `athlete.id`.
 */
export async function exchangeStravaCode(
  input: ExchangeStravaCodeInput,
): Promise<ExchangeStravaCodeResult> {
  if (!input.userId || input.userId.trim() === "") {
    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_MISSING_USER",
      "exchangeStravaCode requer um userId não-vazio.",
    );
  }

  if (!input.code || input.code.trim() === "") {
    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_MISSING_CODE",
      "exchangeStravaCode requer um code não-vazio.",
    );
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_NO_FETCH",
      "Nenhuma implementação de fetch disponível para a troca de token.",
    );
  }

  const tokenResponse = await requestStravaToken({
    code: input.code,
    fetchImpl,
    timeoutMs: input.timeoutMs ?? DEFAULT_STRAVA_TOKEN_EXCHANGE_TIMEOUT_MS,
  });

  const athleteId = tokenResponse.athlete?.id;

  if (athleteId === undefined || athleteId === null) {
    // Na troca inicial o atleta é obrigatório; sua ausência indica resposta
    // inesperada e impede associar a conexão a uma conta Strava.
    throw new StravaTokenExchangeError(
      "STRAVA_TOKEN_EXCHANGE_MISSING_ATHLETE",
      "Resposta de token do Strava sem athlete.id.",
    );
  }

  const athleteIdString = String(athleteId);

  // Scopes concedidos: prioriza o callback (fonte autoritativa); cai para o
  // corpo do token (raro) e, por fim, lista vazia. Persiste apenas o concedido.
  const scopes = normalizeStravaScopes(input.scope ?? tokenResponse.scope ?? null);
  const expiresAt = expiresAtToDate(tokenResponse.expires_at);

  const { connectionId } = await persistStravaConnection({
    userId: input.userId,
    athleteId: athleteIdString,
    scopes,
    expiresAt,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
  });

  // Log seguro: sem tokens/code/secret. Apenas metadados de observabilidade.
  logger.info("Strava connection established via token exchange", {
    provider: "STRAVA",
    operation: "token_exchange",
    status: "connected",
    userId: input.userId,
    connectionId,
    athleteId: athleteIdString,
    scopes,
    grantedScopeCount: scopes.length,
  });

  return {
    connectionId,
    athleteId: athleteIdString,
    scopes,
    expiresAt,
  };
}
