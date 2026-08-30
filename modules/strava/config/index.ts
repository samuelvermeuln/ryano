/**
 * Barrel de configuração do módulo Strava.
 *
 * _Requisitos: 19.1, 19.2, 19.3, 10.7_
 */

export {
  DEFAULT_STRAVA_API_BASE_URL,
  DEFAULT_STRAVA_INITIAL_BACKFILL_DAYS,
  DEFAULT_STRAVA_OAUTH_AUTHORIZE_URL,
  DEFAULT_STRAVA_OAUTH_REVOKE_URL,
  DEFAULT_STRAVA_OAUTH_TOKEN_URL,
  DEFAULT_STRAVA_RATE_LIMIT_OVERALL_DAILY,
  DEFAULT_STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM,
  DEFAULT_STRAVA_RATE_LIMIT_READ_DAILY,
  DEFAULT_STRAVA_RATE_LIMIT_READ_SHORT_TERM,
  getStravaConfig,
  getStravaInitialBackfillDays,
  getStravaRateLimits,
  hasStravaOAuthEnv,
  isStravaCrossProviderReconciliationEnabled,
  stravaEnv,
} from "@/modules/strava/config/env";
export type { StravaConfig, StravaEnv } from "@/modules/strava/config/env";
