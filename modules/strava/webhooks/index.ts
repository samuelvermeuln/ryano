/**
 * Barrel do webhook do Strava (Tasks 7 e 7.1).
 *
 * Superfície pública do subdomínio de webhooks:
 *   - validação do challenge (`verifyStravaWebhookChallenge`);
 *   - handlers da rota fina (`handleStravaWebhookGet`/`handleStravaWebhookPost`)
 *     e ingestão dedupe-aware (`ingestStravaWebhookEvent`);
 *   - processor idempotente (`processStravaWebhookEvent`/
 *     `processPendingStravaWebhookEvents`);
 *   - adapter `WebhookProvider` para o registry (`createStravaWebhookProvider`);
 *   - placeholders de delete/deauthorization delegados à Task 7.3.
 *
 * _Requisitos: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12b.1, 12b.2, 18.3, 20.5_
 */

export {
  STRAVA_HUB_CHALLENGE_PARAM,
  STRAVA_HUB_MODE_PARAM,
  STRAVA_HUB_SUBSCRIBE_MODE,
  STRAVA_HUB_VERIFY_TOKEN_PARAM,
  verifyStravaWebhookChallenge,
} from "@/modules/strava/webhooks/validation";
export type {
  StravaWebhookChallengeFailureReason,
  StravaWebhookChallengeQuery,
  StravaWebhookChallengeResult,
} from "@/modules/strava/webhooks/validation";

export {
  handleStravaWebhookGet,
  handleStravaWebhookPost,
  ingestStravaWebhookEvent,
  STRAVA_WEBHOOK_STATUS_FAILED,
  STRAVA_WEBHOOK_STATUS_PENDING,
  STRAVA_WEBHOOK_STATUS_PROCESSED,
} from "@/modules/strava/webhooks/handler";
export type {
  IngestStravaWebhookEventOptions,
  StravaWebhookIngestResult,
} from "@/modules/strava/webhooks/handler";

export {
  DEFAULT_STRAVA_WEBHOOK_BATCH_LIMIT,
  MAX_STRAVA_WEBHOOK_ATTEMPTS,
  processPendingStravaWebhookEvents,
  processStravaWebhookEvent,
  purgeDeauthorizedUserData,
  purgeDeletedActivityData,
} from "@/modules/strava/webhooks/processor";
export type {
  ProcessPendingStravaWebhookEventsInput,
  ProcessPendingStravaWebhookEventsResult,
  ProcessStravaWebhookOptions,
  StravaWebhookEventOutcome,
} from "@/modules/strava/webhooks/processor";

export { createStravaWebhookProvider } from "@/modules/strava/webhooks/strava-webhook-provider";

export {
  createStravaWebhookSubscription,
  DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS,
  deleteStravaWebhookSubscription,
  STRAVA_SUBSCRIPTION_STATUS_ACTIVE,
  StravaWebhookSubscriptionError,
  viewStravaWebhookSubscription,
} from "@/modules/strava/webhooks/subscription";
export type {
  CreateStravaWebhookSubscriptionResult,
  DeleteStravaWebhookSubscriptionResult,
  StravaSubscriptionSummary,
  StravaWebhookSubscriptionOptions,
  ViewStravaWebhookSubscriptionResult,
} from "@/modules/strava/webhooks/subscription";
