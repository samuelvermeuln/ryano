/**
 * Validação do desafio (challenge) de verificação do webhook do Strava (Task 7).
 *
 * O Strava valida o endereço de callback da subscription com um GET contendo
 * `hub.mode`, `hub.verify_token` e `hub.challenge`. O callback deve responder,
 * em até 2 segundos, com status 200 e o corpo JSON `{ "hub.challenge": <valor> }`.
 *
 * Confirmado na documentação oficial vigente
 * ([Strava Webhooks](https://developers.strava.com/docs/webhooks/) —
 * conteúdo PARAFRASEADO para conformidade com as restrições de licenciamento):
 *
 * - A requisição de validação é um `GET` para o `callback_url`.
 * - A query string traz sempre `hub.mode="subscribe"`, `hub.challenge` (uma
 *   string aleatória a ser ecoada) e `hub.verify_token` (o mesmo valor que a
 *   aplicação definiu ao criar a subscription).
 * - O callback deve responder em até 2s com HTTP 200 e o corpo, em
 *   `application/json`, `{ "hub.challenge": "<valor recebido>" }`.
 * - O `hub.verify_token` existe para o dono da aplicação confirmar que a
 *   requisição veio do serviço de subscription do Strava (não há assinatura por
 *   evento — ver nota do Requisito 12b).
 *
 * Segurança (Req 12b.1, 20.5): a validação compara `hub.verify_token` contra
 * `STRAVA_WEBHOOK_VERIFY_TOKEN` (via `getStravaConfig().webhook.verifyToken`)
 * usando comparação de tempo constante, e NUNCA loga/retorna o token.
 *
 * _Requisitos: 12.2, 12b.1, 20.5_
 */

import { getStravaConfig } from "@/modules/strava/config";

/** Nome dos parâmetros do challenge na query string (conforme doc oficial). */
export const STRAVA_HUB_MODE_PARAM = "hub.mode";
export const STRAVA_HUB_VERIFY_TOKEN_PARAM = "hub.verify_token";
export const STRAVA_HUB_CHALLENGE_PARAM = "hub.challenge";

/** Modo esperado no challenge de validação. */
export const STRAVA_HUB_SUBSCRIBE_MODE = "subscribe";

/** Motivo da recusa de um challenge (para observabilidade — sem PII/segredos). */
export type StravaWebhookChallengeFailureReason =
  | "not_configured"
  | "invalid_mode"
  | "invalid_verify_token"
  | "missing_challenge";

/** Resultado da verificação do challenge do webhook. */
export type StravaWebhookChallengeResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: StravaWebhookChallengeFailureReason };

/** Query de challenge tolerante a chaves ausentes/nulas. */
export type StravaWebhookChallengeQuery = Record<
  string,
  string | null | undefined
>;

/**
 * Comparação de strings em tempo (aproximadamente) constante, para não vazar o
 * comprimento/conteúdo do verify token por diferença de tempo. Sempre percorre o
 * maior comprimento entre os dois valores.
 */
function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1;
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    // charCodeAt fora do range devolve NaN; usamos -1 para diferenciar sem
    // encurtar o laço (mantém o tempo dependente apenas do maior comprimento).
    const charA = i < a.length ? a.charCodeAt(i) : -1;
    const charB = i < b.length ? b.charCodeAt(i) : -1;
    mismatch |= charA ^ charB;
  }

  return mismatch === 0;
}

/**
 * Verifica o challenge de validação do webhook do Strava.
 *
 * Regras (nesta ordem):
 *   1. Se `STRAVA_WEBHOOK_VERIFY_TOKEN` não está configurado → `not_configured`
 *      (a aplicação não pode validar com segurança).
 *   2. Se `hub.mode` != `"subscribe"` → `invalid_mode`.
 *   3. Se `hub.verify_token` não bate com o configurado → `invalid_verify_token`.
 *   4. Se `hub.challenge` está ausente/vazio → `missing_challenge`.
 *   5. Caso contrário → `{ ok: true, challenge }`, para a rota ecoar em JSON.
 *
 * Também é usada pelo `WebhookProvider.verifyChallenge` do módulo (registry).
 *
 * @param query parâmetros da query string (`hub.mode`, `hub.verify_token`,
 *   `hub.challenge`).
 */
export function verifyStravaWebhookChallenge(
  query: StravaWebhookChallengeQuery,
): StravaWebhookChallengeResult {
  const configuredVerifyToken = getStravaConfig().webhook.verifyToken;

  if (!configuredVerifyToken) {
    return { ok: false, reason: "not_configured" };
  }

  const mode = query[STRAVA_HUB_MODE_PARAM] ?? "";
  if (mode !== STRAVA_HUB_SUBSCRIBE_MODE) {
    return { ok: false, reason: "invalid_mode" };
  }

  const verifyToken = query[STRAVA_HUB_VERIFY_TOKEN_PARAM] ?? "";
  if (!timingSafeEqual(verifyToken, configuredVerifyToken)) {
    return { ok: false, reason: "invalid_verify_token" };
  }

  const challenge = query[STRAVA_HUB_CHALLENGE_PARAM] ?? "";
  if (challenge.trim() === "") {
    return { ok: false, reason: "missing_challenge" };
  }

  return { ok: true, challenge };
}
