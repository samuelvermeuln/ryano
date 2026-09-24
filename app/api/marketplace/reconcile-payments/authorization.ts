import { env } from "@/server/env";

/**
 * TM064 — same shape as `isAuthorizedStravaJobRequest`
 * (`app/api/integrations/strava/jobs/authorization.ts`): a dedicated admin
 * key checked via `Authorization: Bearer` or `x-admin-key`, never a user
 * session (this route is meant for an external scheduler, not a browser).
 */
export function isAuthorizedMarketplaceJobRequest(request: Request): boolean {
  const expectedKey = env.MARKETPLACE_ADMIN_KEY;
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
