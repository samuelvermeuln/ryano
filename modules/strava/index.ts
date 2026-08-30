/**
 * Superfície pública do módulo Strava.
 *
 * Esqueleto da Fase 5.1. Por ora expõe apenas a configuração validada (Task 5) e
 * o `stravaModule` registrado no `providerRegistry` (stub, ver
 * `infrastructure/provider`). As demais camadas são preenchidas nas fases
 * seguintes e reexportadas aqui conforme ficarem prontas:
 *
 * - auth (oauth/token-exchange/token-refresh/revoke): tarefas 5.2–5.4
 * - rotas OAuth (adapters finos): tarefa 5.5
 * - api client + dto/schemas + parsers: tarefas 6.x
 * - webhooks (validation/handler/processor): tarefa 7.x
 * - application (connect/sync/disconnect/cleanup): tarefas 5.x–8.x
 * - presentation (components/view-models): tarefa 8.2–8.3
 *
 * _Requisitos: 1.1, 2.5, 4.1, 4.3_
 */

// Config / ENV (Task 5)
export {
  DEFAULT_STRAVA_API_BASE_URL,
  DEFAULT_STRAVA_INITIAL_BACKFILL_DAYS,
  DEFAULT_STRAVA_OAUTH_AUTHORIZE_URL,
  DEFAULT_STRAVA_OAUTH_REVOKE_URL,
  DEFAULT_STRAVA_OAUTH_TOKEN_URL,
  getStravaConfig,
  getStravaInitialBackfillDays,
  hasStravaOAuthEnv,
  isStravaCrossProviderReconciliationEnabled,
  stravaEnv,
} from "@/modules/strava/config";
export type { StravaConfig, StravaEnv } from "@/modules/strava/config";

// OAuth: state assinado + authorize URL (Task 5.2);
// troca de código por token + persistência (Task 5.3);
// refresh com rotação + lock (Task 5.4); revoke + limpeza (Task 5.4)
export {
  buildStravaAuthorizeUrl,
  createStravaOAuthState,
  DEFAULT_STRAVA_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS,
  DEFAULT_STRAVA_OAUTH_SCOPES,
  DEFAULT_STRAVA_OAUTH_STATE_TTL_SECONDS,
  DEFAULT_STRAVA_REVOKE_TIMEOUT_MS,
  DEFAULT_STRAVA_TOKEN_EXCHANGE_TIMEOUT_MS,
  DEFAULT_STRAVA_TOKEN_REFRESH_TIMEOUT_MS,
  exchangeStravaCode,
  getValidStravaAccessToken,
  normalizeStravaScopes,
  refreshStravaToken,
  revokeStravaConnection,
  StravaRevokeError,
  StravaTokenExchangeError,
  StravaTokenRefreshError,
  verifyStravaOAuthState,
} from "@/modules/strava/auth";
export type {
  BuildStravaAuthorizeUrlInput,
  ExchangeStravaCodeInput,
  ExchangeStravaCodeResult,
  GetValidStravaAccessTokenInput,
  RefreshStravaTokenInput,
  RefreshStravaTokenResult,
  RevokeStravaConnectionInput,
  RevokeStravaConnectionResult,
  RevokeStravaConnectionSelector,
  StravaApprovalPrompt,
  StravaConnectionSelector,
  StravaOAuthStateInvalidReason,
  StravaOAuthStateVerification,
  ValidStravaAccessToken,
} from "@/modules/strava/auth";

// Provider module registrado no core (Task 5.1; activity ligado na Task 6.4)
export { stravaModule } from "@/modules/strava/infrastructure/provider";

// API client (Task 6): comunicação autenticada com a API v3 do Strava.
export {
  createStravaClient,
  DEFAULT_STRAVA_CLIENT_TIMEOUT_MS,
  STRAVA_MAX_ACTIVITIES_PER_PAGE,
  StravaAuthError,
  StravaClient,
  StravaClientError,
  StravaRateLimitError,
  StravaRateLimitExceededError,
} from "@/modules/strava/api/client";
export type {
  ListAthleteActivitiesParams,
  StravaClientContext,
  StravaClientOptions,
} from "@/modules/strava/api/client";

// Sync/backfill de atividades (Task 6.4) e batch por job (Task 8.1).
export { syncAllStravaUsers, syncStravaForUser } from "@/modules/strava/application/sync";
export type {
  StravaSyncMode,
  StravaSyncStatus,
  SyncAllStravaUsersInput,
  SyncAllStravaUsersResult,
  SyncStravaForUserInput,
  SyncStravaResult,
  SyncStravaUserOutcome,
} from "@/modules/strava/application/sync";

// Retenção/cleanup por TTL e purges por evento (Tasks 7.3 e 8).
export {
  purgeExpiredActivityCache,
  purgeExpiredStreams,
  purgeExpiredWebhookPayloads,
  runStravaRetentionCleanup,
} from "@/modules/strava/application/cleanup";
export type {
  PurgeExpiredActivityCacheInput,
  PurgeExpiredActivityCacheResult,
  PurgeExpiredStreamsInput,
  PurgeExpiredStreamsResult,
  PurgeExpiredWebhookPayloadsInput,
  PurgeExpiredWebhookPayloadsResult,
  RunStravaRetentionCleanupInput,
  RunStravaRetentionCleanupResult,
} from "@/modules/strava/application/cleanup";

// Webhook (Tasks 7 e 7.1): rota fina (GET challenge + POST evento), ingestão
// dedupe-aware e processor idempotente de eventos PENDENTES.
export {
  createStravaWebhookProvider,
  createStravaWebhookSubscription,
  DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS,
  DEFAULT_STRAVA_WEBHOOK_BATCH_LIMIT,
  deleteStravaWebhookSubscription,
  handleStravaWebhookGet,
  handleStravaWebhookPost,
  ingestStravaWebhookEvent,
  MAX_STRAVA_WEBHOOK_ATTEMPTS,
  processPendingStravaWebhookEvents,
  processStravaWebhookEvent,
  purgeDeauthorizedUserData,
  purgeDeletedActivityData,
  STRAVA_SUBSCRIPTION_STATUS_ACTIVE,
  STRAVA_WEBHOOK_STATUS_FAILED,
  STRAVA_WEBHOOK_STATUS_PENDING,
  STRAVA_WEBHOOK_STATUS_PROCESSED,
  StravaWebhookSubscriptionError,
  verifyStravaWebhookChallenge,
  viewStravaWebhookSubscription,
} from "@/modules/strava/webhooks";
export type {
  CreateStravaWebhookSubscriptionResult,
  DeleteStravaWebhookSubscriptionResult,
  ProcessPendingStravaWebhookEventsInput,
  ProcessPendingStravaWebhookEventsResult,
  ProcessStravaWebhookOptions,
  StravaSubscriptionSummary,
  StravaWebhookChallengeResult,
  StravaWebhookEventOutcome,
  StravaWebhookIngestResult,
  StravaWebhookSubscriptionOptions,
  ViewStravaWebhookSubscriptionResult,
} from "@/modules/strava/webhooks";

// Parsers: DTO remoto → contrato interno (Task 6.2).
// `normalizeStravaScopes` NÃO é reexportado daqui para evitar colisão de nome
// com o export homônimo de `@/modules/strava/auth` (acima); use o barrel
// `@/modules/strava/parsers` quando precisar da versão pura do parser.
export {
  parseStravaActivity,
  parseStravaSportType,
  parseStravaTokenResponse,
  StravaTokenResponseParseError,
} from "@/modules/strava/parsers";
export type {
  ParsedStravaTokenResponse,
  ParseStravaTokenResponseOptions,
  StravaActivityDto,
} from "@/modules/strava/parsers";
