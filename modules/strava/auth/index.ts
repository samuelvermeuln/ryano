/**
 * Barrel da camada de autenticação (OAuth) do módulo Strava.
 *
 * Preenchido incrementalmente pelas tarefas 5.2–5.4:
 * - `oauth.ts` (5.2): state assinado + authorize URL.
 * - `token-exchange.ts` (5.3): troca de código por token + persistência.
 * - `token-refresh.ts` (5.4): refresh com rotação + lock anti-concorrência.
 * - `revoke.ts` (5.4): deauthorize + limpeza local (sem afetar outros providers).
 *
 * _Requisitos: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 3.6_
 */

export {
  buildStravaAuthorizeUrl,
  createStravaOAuthState,
  DEFAULT_STRAVA_OAUTH_SCOPES,
  DEFAULT_STRAVA_OAUTH_STATE_TTL_SECONDS,
  verifyStravaOAuthState,
} from "@/modules/strava/auth/oauth";
export type {
  BuildStravaAuthorizeUrlInput,
  StravaApprovalPrompt,
  StravaOAuthStateInvalidReason,
  StravaOAuthStateVerification,
} from "@/modules/strava/auth/oauth";

export {
  DEFAULT_STRAVA_TOKEN_EXCHANGE_TIMEOUT_MS,
  exchangeStravaCode,
  normalizeStravaScopes,
  StravaTokenExchangeError,
} from "@/modules/strava/auth/token-exchange";
export type {
  ExchangeStravaCodeInput,
  ExchangeStravaCodeResult,
} from "@/modules/strava/auth/token-exchange";

export {
  DEFAULT_STRAVA_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS,
  DEFAULT_STRAVA_TOKEN_REFRESH_TIMEOUT_MS,
  getValidStravaAccessToken,
  refreshStravaToken,
  StravaTokenRefreshError,
} from "@/modules/strava/auth/token-refresh";
export type {
  GetValidStravaAccessTokenInput,
  RefreshStravaTokenInput,
  RefreshStravaTokenResult,
  StravaConnectionSelector,
  ValidStravaAccessToken,
} from "@/modules/strava/auth/token-refresh";

export {
  DEFAULT_STRAVA_REVOKE_TIMEOUT_MS,
  revokeStravaConnection,
  StravaRevokeError,
} from "@/modules/strava/auth/revoke";
export type {
  RevokeStravaConnectionInput,
  RevokeStravaConnectionResult,
  RevokeStravaConnectionSelector,
} from "@/modules/strava/auth/revoke";
