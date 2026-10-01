/**
 * Barrel do client HTTP do Strava (Task 6).
 *
 * _Requisitos: 11.1, 11.5, 20.3, 20.4_
 */

export {
  createStravaClient,
  DEFAULT_STRAVA_CLIENT_TIMEOUT_MS,
  getMissingStravaPermissions,
  isStravaReauthRequiredError,
  STRAVA_MAX_ACTIVITIES_PER_PAGE,
  STRAVA_REAUTH_ERROR_CODES,
  StravaAuthError,
  StravaClient,
  StravaClientError,
  StravaRateLimitError,
  StravaRateLimitExceededError,
  StravaScopeError,
} from "@/modules/strava/api/client/strava-client";
export type {
  ListAthleteActivitiesParams,
  StravaClientContext,
  StravaClientOptions,
} from "@/modules/strava/api/client/strava-client";
