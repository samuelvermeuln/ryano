/**
 * Barrel do client HTTP do Strava (Task 6).
 *
 * _Requisitos: 11.1, 11.5, 20.3, 20.4_
 */

export {
  createStravaClient,
  DEFAULT_STRAVA_CLIENT_TIMEOUT_MS,
  STRAVA_MAX_ACTIVITIES_PER_PAGE,
  StravaAuthError,
  StravaClient,
  StravaClientError,
  StravaRateLimitError,
  StravaRateLimitExceededError,
} from "@/modules/strava/api/client/strava-client";
export type {
  ListAthleteActivitiesParams,
  StravaClientContext,
  StravaClientOptions,
} from "@/modules/strava/api/client/strava-client";
