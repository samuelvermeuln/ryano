/**
 * Fluxo de autorização OAuth 2.0 do Strava — geração/validação de `state`
 * (proteção CSRF) e montagem da URL de autorização.
 *
 * Escopo desta camada (Task 5.2): apenas os helpers *puros* e server-only para
 * (1) criar/verificar o `state` e (2) montar a authorize URL. A troca de código
 * por token vive em `token-exchange.ts` (5.3) e as rotas finas em 5.5.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Parâmetros confirmados na documentação oficial vigente
 * ([Strava Authentication](https://developers.strava.com/docs/authentication/)):
 *
 * - Web authorize endpoint: `GET https://www.strava.com/oauth/authorize`
 *   (vem de `getStravaConfig().oauth.authorizeUrl`).
 * - `client_id` (obrigatório): ID da aplicação.
 * - `redirect_uri` (obrigatório): destino do callback; precisa estar no domínio
 *   de callback registrado no app (vem de `getStravaConfig().oauth.callbackUrl`).
 * - `response_type` (obrigatório): deve ser exatamente `code`.
 * - `scope` (obrigatório): lista de scopes separada por vírgula (ou espaço
 *   URL-safe). Confirmado que `activity:read` habilita a leitura de atividades
 *   visíveis e é o scope exigido para webhooks de atividade, enquanto
 *   `activity:read_all` adiciona atividades privadas / "Somente você".
 * - `approval_prompt` (opcional): `force` ou `auto`; default `auto`. Usamos
 *   `auto` por padrão para não reexibir o consentimento quando já concedido.
 * - `state` (opcional, mas usado aqui para CSRF): é sempre devolvido no callback
 *   quando fornecido, então o validamos na volta para garantir que o fluxo
 *   partiu da nossa aplicação e para recuperar o usuário associado.
 *
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Estratégia de `state` (Req 10.2): stateless e verificável via HMAC-SHA256, sem
 * necessidade de persistência em banco. O payload codifica `userId`, um nonce
 * aleatório e o timestamp de emissão; a assinatura usa um segredo do servidor
 * (`AUTH_SECRET`, com fallback para `DATA_ENCRYPTION_KEY`). Na volta,
 * `verifyStravaOAuthState` recomputa a assinatura em tempo constante e rejeita
 * states adulterados ou expirados.
 *
 * Nenhum segredo é logado. As URLs/scopes vêm de `getStravaConfig()` /
 * constantes deste módulo, nunca hardcoded espalhado (Req 10.7).
 *
 * _Requisitos: 10.1, 10.2, 10.7_
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getStravaConfig } from "@/modules/strava/config";
import { env } from "@/server/env";

/**
 * Scopes solicitados por padrão ao Strava.
 *
 * - `activity:read`: exigido para webhooks de atividade e leitura de atividades
 *   visíveis (Everyone/Followers).
 * - `activity:read_all`: adiciona atividades privadas / com visibilidade
 *   "Somente você" e dados de privacy zone.
 *
 * O usuário pode desmarcar scopes na tela de autorização; os scopes de fato
 * concedidos são lidos da resposta do callback/token (Task 5.3, Req 10.4).
 */
export const DEFAULT_STRAVA_OAUTH_SCOPES = [
  "activity:read",
  "activity:read_all",
] as const;

/** Valores aceitos para `approval_prompt` na authorize URL. */
export type StravaApprovalPrompt = "auto" | "force";

/** `response_type` exigido pelo Strava (deve ser sempre `code`). */
const OAUTH_RESPONSE_TYPE = "code";

/** Validade padrão do `state` (10 minutos). OAuth state deve ser curto. */
export const DEFAULT_STRAVA_OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * Payload interno do `state` assinado. Chaves curtas para manter o token compacto:
 * `u` = userId, `n` = nonce, `iat` = issued-at (epoch em segundos).
 */
interface StravaOAuthStatePayload {
  u: string;
  n: string;
  iat: number;
}

/**
 * Resolve o segredo do servidor usado para assinar o `state`.
 *
 * Prioriza `AUTH_SECRET` (segredo de sessão/CSRF do NextAuth) e cai para
 * `DATA_ENCRYPTION_KEY`. Lança se nenhum estiver configurado — sem um segredo
 * não há proteção CSRF real, então falhar é o comportamento seguro.
 *
 * Não é uma variável `STRAVA_*`, portanto não viola a centralização do
 * `config/env.ts` (Req 19.2); é lido via `server/env` centralizado.
 */
function getStateSigningSecret(): string {
  const secret = env.AUTH_SECRET ?? env.DATA_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error(
      "Strava OAuth state secret ausente: configure AUTH_SECRET ou DATA_ENCRYPTION_KEY.",
    );
  }

  return secret;
}

/** Codifica um Buffer/string em base64url (sem padding). */
function toBase64Url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64url");
}

/** Assina (HMAC-SHA256) a parte codificada do payload e retorna base64url. */
function signPayloadPart(encodedPayload: string): string {
  return toBase64Url(
    createHmac("sha256", getStateSigningSecret()).update(encodedPayload).digest(),
  );
}

/** Comparação de assinaturas em tempo constante (evita timing attacks). */
function safeSignatureEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Gera um `state` assinado e verificável para o fluxo OAuth do Strava (Req 10.2).
 *
 * O token tem o formato `<payloadBase64url>.<assinaturaBase64url>`, onde o payload
 * carrega o `userId`, um nonce aleatório e o timestamp de emissão. A assinatura
 * HMAC impede adulteração; a verificação é stateless (não requer banco).
 *
 * @param userId Identificador do usuário que inicia a conexão.
 * @returns String opaca a ser enviada como parâmetro `state` na authorize URL.
 */
export function createStravaOAuthState(userId: string): string {
  if (!userId || userId.trim() === "") {
    throw new Error("createStravaOAuthState requer um userId não-vazio.");
  }

  const payload: StravaOAuthStatePayload = {
    u: userId,
    n: randomBytes(16).toString("hex"),
    iat: Math.floor(Date.now() / 1000),
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayloadPart(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

/** Motivos de rejeição de um `state`, úteis para observabilidade/mensagens. */
export type StravaOAuthStateInvalidReason =
  | "malformed"
  | "bad_signature"
  | "expired";

/** Resultado da verificação de um `state`. */
export type StravaOAuthStateVerification =
  | {
      valid: true;
      userId: string;
      issuedAt: number;
    }
  | {
      valid: false;
      reason: StravaOAuthStateInvalidReason;
    };

/**
 * Verifica um `state` recebido no callback do Strava (Req 10.2).
 *
 * Confere a assinatura HMAC em tempo constante e a expiração. Retorna o `userId`
 * embutido quando válido, sem consultar o banco.
 *
 * @param state Valor do parâmetro `state` retornado pelo Strava.
 * @param options.maxAgeSeconds Janela de validade (default: 10 minutos).
 * @param options.now Instante de referência (epoch ms) — injetável para testes.
 */
export function verifyStravaOAuthState(
  state: string | null | undefined,
  options: { maxAgeSeconds?: number; now?: number } = {},
): StravaOAuthStateVerification {
  if (!state || typeof state !== "string") {
    return { valid: false, reason: "malformed" };
  }

  const parts = state.split(".");

  if (parts.length !== 2) {
    return { valid: false, reason: "malformed" };
  }

  const [encodedPayload, signature] = parts;

  if (!encodedPayload || !signature) {
    return { valid: false, reason: "malformed" };
  }

  const expectedSignature = signPayloadPart(encodedPayload);

  if (!safeSignatureEqual(signature, expectedSignature)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload: StravaOAuthStatePayload;

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    payload = JSON.parse(decoded) as StravaOAuthStatePayload;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (
    typeof payload?.u !== "string" ||
    payload.u.trim() === "" ||
    typeof payload?.iat !== "number" ||
    !Number.isFinite(payload.iat)
  ) {
    return { valid: false, reason: "malformed" };
  }

  const maxAgeSeconds =
    options.maxAgeSeconds ?? DEFAULT_STRAVA_OAUTH_STATE_TTL_SECONDS;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);

  if (nowSeconds - payload.iat > maxAgeSeconds || payload.iat > nowSeconds + 60) {
    // Expirado, ou emitido muito no futuro (clock skew além de 60s → suspeito).
    return { valid: false, reason: "expired" };
  }

  return { valid: true, userId: payload.u, issuedAt: payload.iat };
}

/** Parâmetros para montar a authorize URL do Strava. */
export interface BuildStravaAuthorizeUrlInput {
  /** `state` assinado (use `createStravaOAuthState`). */
  state: string;
  /** Scopes a solicitar; default: {@link DEFAULT_STRAVA_OAUTH_SCOPES}. */
  scopes?: readonly string[];
  /** `approval_prompt` (`auto`/`force`); default: `auto`. */
  approvalPrompt?: StravaApprovalPrompt;
}

/**
 * Monta a URL de autorização OAuth do Strava (Req 10.1, 10.7).
 *
 * Todos os parâmetros vêm de `getStravaConfig()` (URL de authorize, client id e
 * callback) e das constantes deste módulo — nada é hardcoded espalhado. Função
 * pura: não faz rede, apenas constrói a string. Lança se o client id ou a
 * `redirect_uri` (callback) não estiverem configurados.
 *
 * @returns A URL completa para redirecionar o usuário ao consentimento do Strava.
 */
export function buildStravaAuthorizeUrl(
  input: BuildStravaAuthorizeUrlInput,
): string {
  const { state, scopes = DEFAULT_STRAVA_OAUTH_SCOPES, approvalPrompt = "auto" } =
    input;

  if (!state || state.trim() === "") {
    throw new Error("buildStravaAuthorizeUrl requer um state não-vazio.");
  }

  const config = getStravaConfig();

  if (!config.clientId) {
    throw new Error(
      "STRAVA_CLIENT_ID não configurado: impossível iniciar o fluxo OAuth do Strava.",
    );
  }

  const redirectUri = config.oauth.callbackUrl;

  if (!redirectUri) {
    throw new Error(
      "STRAVA_OAUTH_CALLBACK_URL não configurado: impossível montar a redirect_uri.",
    );
  }

  if (scopes.length === 0) {
    throw new Error("buildStravaAuthorizeUrl requer ao menos um scope.");
  }

  const url = new URL(config.oauth.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", OAUTH_RESPONSE_TYPE);
  // Scopes separados por vírgula, conforme aceito pela doc oficial.
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("approval_prompt", approvalPrompt);
  url.searchParams.set("state", state);

  return url.toString();
}
