/**
 * Revogação da conexão Strava (deauthorize) + limpeza local dos tokens e
 * detalhes, sem afetar outros providers.
 *
 * Escopo desta camada (Task 5.4):
 *   1. `POST` no endpoint de deauthorização/revoke com o access token atual.
 *   2. Limpeza local: apaga os `WearableSecret` da conexão, apaga o
 *      `StravaConnectionDetails` e marca a `WearableConnection` como
 *      DISCONNECTED — SEM tocar em conexões de outros providers (Req 10.6, 3.6).
 *
 * NÃO faz parte desta camada: a rota/adapter de disconnect (Task 5.5), que
 * apenas resolve o usuário autenticado e delega a esta função.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Confirmação na documentação oficial vigente do Strava
 * ([Strava Authentication](https://developers.strava.com/docs/authentication/)):
 *
 * - Endpoint atual em produção: `POST https://www.strava.com/oauth/deauthorize`
 *   com o parâmetro `access_token`. Revogar invalida TODOS os access/refresh
 *   tokens que a aplicação tem para aquele atleta e remove o app da conta.
 * - Novo endpoint anunciado: `POST https://www.strava.com/oauth/revoke` (opção a
 *   partir de 2026, único suportado a partir de 2027), que usa HTTP Basic Auth
 *   (client_id:client_secret) e recebe `token` (+ `token_type_hint` opcional),
 *   respondendo 200 com corpo vazio independentemente de o token existir.
 *
 * Esta implementação usa o endpoint configurado em
 * `getStravaConfig().oauth.revokeUrl` (default: `/oauth/deauthorize`) no formato
 * de deauthorização (`access_token`). Quando a migração para `/oauth/revoke` for
 * necessária, basta ajustar a construção do corpo aqui — a limpeza local é
 * idêntica.
 *
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Resiliência: se a revogação remota FALHAR (rede/timeout/HTTP não-OK), ainda
 * assim executamos a limpeza local para que o usuário não fique "preso" como
 * conectado. Como a revogação no Strava é idempotente e o usuário pode remover o
 * app diretamente na conta Strava, priorizamos deixar o estado local coerente
 * (desconectado, sem secrets). A falha remota é logada (sem tokens) e não
 * propaga por padrão.
 *
 * Segurança (Req 20.1/20.2): nenhum log inclui `client_secret`, `access_token`
 * ou `refresh_token` — apenas metadados seguros.
 *
 * _Requisitos: 10.6, 3.6, 20.1, 20.2_
 */

import { SecretType, WearableProvider } from "@prisma/client";

import { getStravaConfig } from "@/modules/strava/config";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/crypto/secret-vault";
import { logger } from "@/server/logging/logger";

/** Timeout padrão (ms) da requisição de deauthorização/revoke. */
export const DEFAULT_STRAVA_REVOKE_TIMEOUT_MS = 10_000;

/** Seletor da conexão a revogar: por id direto OU por usuário. */
export type RevokeStravaConnectionSelector =
  | { connectionId: string; userId?: string }
  | { userId: string; connectionId?: undefined };

/** Parâmetros da revogação. */
export type RevokeStravaConnectionInput = RevokeStravaConnectionSelector & {
  /** `fetch` injetável para testes (default: `fetch` global). */
  fetchImpl?: typeof fetch;
  /** Timeout da requisição (ms). */
  timeoutMs?: number;
};

/** Resultado da revogação. */
export interface RevokeStravaConnectionResult {
  /** Id da `WearableConnection` (STRAVA) revogada, ou `null` se não existia. */
  connectionId: string | null;
  /** `true` se a limpeza local foi executada (secrets/detalhes removidos). */
  cleanedUp: boolean;
  /** `true` se o `POST` remoto de deauthorização respondeu com sucesso. */
  remoteRevoked: boolean;
}

/**
 * Erro de revogação do Strava. Carrega um `code` estável para observabilidade,
 * sem vazar segredos. Usado apenas para condições que impedem prosseguir (ex.:
 * seletor inválido); a falha remota NÃO lança por padrão (ver resiliência).
 */
export class StravaRevokeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StravaRevokeError";
    this.code = code;
  }
}

/** Resolve a `WearableConnection` (STRAVA) pelo seletor; `null` se não existir. */
async function findStravaConnection(
  selector: RevokeStravaConnectionSelector,
): Promise<{ id: string } | null> {
  if (selector.connectionId) {
    const connection = await prisma.wearableConnection.findUnique({
      where: { id: selector.connectionId },
      select: { id: true, provider: true },
    });

    if (!connection || connection.provider !== WearableProvider.STRAVA) {
      return null;
    }

    return { id: connection.id };
  }

  if (selector.userId) {
    const connection = await prisma.wearableConnection.findUnique({
      where: {
        userId_provider: {
          userId: selector.userId,
          provider: WearableProvider.STRAVA,
        },
      },
      select: { id: true },
    });

    return connection ? { id: connection.id } : null;
  }

  throw new StravaRevokeError(
    "STRAVA_REVOKE_INVALID_SELECTOR",
    "revokeStravaConnection requer connectionId ou userId.",
  );
}

/** Lê e decifra o access token da conexão; retorna `null` se ausente. */
async function readAccessToken(connectionId: string): Promise<string | null> {
  const secret = await prisma.wearableSecret.findUnique({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId: connectionId,
        secretType: SecretType.STRAVA_ACCESS_TOKEN,
      },
    },
  });

  if (!secret) {
    return null;
  }

  return decryptSecret(secret);
}

/**
 * `POST` de deauthorização com o access token. Resiliente: retorna `false` em
 * qualquer falha (rede/timeout/HTTP não-OK) em vez de lançar, para que a
 * limpeza local sempre ocorra. Nunca loga o token.
 */
async function requestStravaDeauthorize(input: {
  accessToken: string;
  connectionId: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<boolean> {
  const config = getStravaConfig();
  const body = new URLSearchParams({ access_token: input.accessToken });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImpl(config.oauth.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("Strava deauthorize returned non-OK status", {
        provider: "STRAVA",
        operation: "revoke",
        connectionId: input.connectionId,
        status: "http_error",
        httpStatus: response.status,
      });

      return false;
    }

    return true;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";

    logger.warn("Strava deauthorize request failed", {
      provider: "STRAVA",
      operation: "revoke",
      connectionId: input.connectionId,
      status: aborted ? "timeout" : "network_error",
    });

    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Limpeza local transacional: apaga os secrets da conexão, apaga o
 * `StravaConnectionDetails` e marca a `WearableConnection` como DISCONNECTED.
 *
 * Escopada por `wearableConnectionId`, portanto NÃO afeta secrets/detalhes/
 * conexões de outros providers do mesmo usuário (Req 10.6, 3.6).
 */
async function cleanupStravaConnection(connectionId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.wearableSecret.deleteMany({
      where: { wearableConnectionId: connectionId },
    });

    await tx.stravaConnectionDetails.deleteMany({
      where: { wearableConnectionId: connectionId },
    });

    await tx.wearableConnection.update({
      where: { id: connectionId },
      data: {
        status: "DISCONNECTED",
        lastSyncStatus: "DISCONNECTED",
        lastErrorCode: null,
        externalAccountId: null,
        lastEventAt: new Date(),
      },
    });
  });
}

/**
 * Revoga a conexão Strava do usuário/conexão e limpa o estado local.
 *
 * Fluxo:
 *   1. Resolve a conexão STRAVA (por id ou usuário). Se não existir, retorna
 *      `{ connectionId: null, cleanedUp: false, remoteRevoked: false }`
 *      (idempotente — desconectar algo já desconectado é no-op).
 *   2. Lê o access token e faz o `POST` de deauthorização (resiliente).
 *   3. Executa a limpeza local (secrets + detalhes + status DISCONNECTED),
 *      independentemente do resultado remoto.
 *
 * @throws {StravaRevokeError} apenas para seletor inválido.
 */
export async function revokeStravaConnection(
  input: RevokeStravaConnectionInput,
): Promise<RevokeStravaConnectionResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_STRAVA_REVOKE_TIMEOUT_MS;

  const connection = await findStravaConnection(input);

  if (!connection) {
    // Nada a fazer: não existe conexão Strava para revogar.
    return { connectionId: null, cleanedUp: false, remoteRevoked: false };
  }

  const accessToken = await readAccessToken(connection.id);

  let remoteRevoked = false;

  if (accessToken && typeof fetchImpl === "function") {
    remoteRevoked = await requestStravaDeauthorize({
      accessToken,
      connectionId: connection.id,
      fetchImpl,
      timeoutMs,
    });
  } else if (!accessToken) {
    // Sem access token local não há como/necessidade de revogar remotamente;
    // seguimos direto para a limpeza local.
    logger.info("Strava revoke skipped remote step (no local access token)", {
      provider: "STRAVA",
      operation: "revoke",
      connectionId: connection.id,
      status: "no_local_token",
    });
  }

  // Limpeza local sempre acontece (resiliência): mesmo se o remoto falhou, o
  // usuário não deve ficar preso como conectado.
  await cleanupStravaConnection(connection.id);

  logger.info("Strava connection revoked and cleaned up", {
    provider: "STRAVA",
    operation: "revoke",
    connectionId: connection.id,
    status: "disconnected",
    remoteRevoked,
  });

  return { connectionId: connection.id, cleanedUp: true, remoteRevoked };
}
