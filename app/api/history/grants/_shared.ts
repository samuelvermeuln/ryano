import { schoolResponse } from "../../schools/_shared";

export { schoolBody } from "../../schools/_shared";
export type HistoryGrantRouteContext = { params: Promise<{ grantId: string }> };

/** Consent is private and revocation must never leave a cacheable response. */
export async function historyGrantResponse(operation: (actorId: string) => Promise<unknown>, status = 200) {
  const response = await schoolResponse(operation, status);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
