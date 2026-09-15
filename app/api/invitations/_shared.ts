export { schoolBody, schoolResponse, publicSchoolResponse } from "../schools/_shared";

// Next requires one dynamic segment name for token resolution and ID-based management.
export type InvitationRouteContext = { params: Promise<{ id: string }> };

/** Bearer credentials and their preview/acceptance responses must never be cached. */
export async function invitationResponse(response: Promise<Response>) {
  const result = await response;
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}
