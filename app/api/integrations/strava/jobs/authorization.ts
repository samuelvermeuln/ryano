import { env } from "@/server/env";

/** Authorizes Strava cron requests with the dedicated or shared admin key. */
export function isAuthorizedStravaJobRequest(request: Request): boolean {
  const expectedKey = env.STRAVA_ADMIN_KEY ?? env.GARMIN_ADMIN_KEY;
  if (!expectedKey) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;
  const adminKey = request.headers.get("x-admin-key")?.trim();

  return bearer === expectedKey || adminKey === expectedKey;
}
