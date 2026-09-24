/**
 * TM037 (RF-107) — open-redirect protection for the marketplace buyer entry
 * point.
 *
 * This app already has an established, working convention for validating a
 * post-login redirect target: `loginAction`/`signupAction`
 * (`app/actions/auth.ts`) and `requireOnboardedSession`
 * (`server/auth-guards.ts`) all independently check
 * `raw.startsWith("/") && !raw.startsWith("//")` before using a
 * client-supplied `callbackUrl`/`next` value to redirect — there is no single
 * exported helper (it is duplicated inline three times), so there is nothing
 * to import and reuse verbatim. That mechanism is NOT being touched here —
 * `loginAction`/`signupAction` keep doing exactly what they already do, and
 * the actual post-login redirect for a marketplace buyer still goes through
 * them unmodified.
 *
 * What is new: a callback specifically for "return to the product page the
 * visitor was trying to buy" is narrower than "any relative path in the
 * app". Reusing the generic relative-path check alone would accept
 * `/admin`, `/escola/<id>/deactivate`, or any other internal route as a
 * "marketplace return" — never external, but also never validated against
 * what this flow is actually supposed to preserve (RF-107: productId,
 * version and intent). This module is that narrower, purpose-built check:
 * it only accepts paths under `/marketplace/`, and it can also BUILD that
 * path server-side from a productId/versionId/intent — the safest shape,
 * since the common case (CTA click while logged out) never has to trust a
 * client-supplied URL at all, only values the server already validated.
 */

export const MARKETPLACE_CALLBACK_PREFIX = "/marketplace/";

const SCHEME_AFTER_PREFIX = /^\/marketplace\/[a-z][a-z0-9+.-]*:/i;

/**
 * True only for an internal, same-origin path scoped to the marketplace
 * product namespace. Rejects: anything without a leading `/marketplace/`
 * (this alone already rejects every absolute URL — `https://evil.example.com`
 * does not start with `/marketplace/`, and neither does a protocol-relative
 * `//evil.example.com/marketplace/x`, since that starts with `//`, not
 * `/marketplace/`), backslash tricks some URL parsers normalize to `/`, and
 * a value that smuggles a scheme after the prefix (defense in depth beyond
 * what the prefix check alone already guarantees).
 */
export function isSafeMarketplaceCallbackPath(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length === 0 || raw.length > 2048) return false;
  if (!raw.startsWith(MARKETPLACE_CALLBACK_PREFIX)) return false;
  if (raw.startsWith("//")) return false;
  if (raw.includes("\\")) return false;
  if (SCHEME_AFTER_PREFIX.test(raw)) return false;
  return true;
}

/** Returns the path unchanged when safe, `null` otherwise — never throws. */
export function parseSafeMarketplaceCallbackPath(raw: unknown): string | null {
  return isSafeMarketplaceCallbackPath(raw) ? raw : null;
}

export const MarketplaceCallbackIntent = {
  VIEW: "view",
  PURCHASE: "purchase",
  ACQUIRE_FREE: "acquire-free",
} as const;
export type MarketplaceCallbackIntent = (typeof MarketplaceCallbackIntent)[keyof typeof MarketplaceCallbackIntent];

export interface BuildMarketplaceCallbackUrlInput {
  productId: string;
  versionId?: string | null;
  intent: MarketplaceCallbackIntent;
}

/**
 * Builds the internal callback URL server-side — the preferred path for the
 * common case, since the server never has to trust a client-supplied URL at
 * all for "CTA click while logged out". The productId is a route segment,
 * not a query value, so it is percent-encoded defensively even though it is
 * expected to already be a safe id/slug.
 */
export function buildMarketplaceCallbackUrl({ productId, versionId, intent }: BuildMarketplaceCallbackUrlInput): string {
  const params = new URLSearchParams({ intent });
  if (versionId) params.set("versionId", versionId);
  return `${MARKETPLACE_CALLBACK_PREFIX}${encodeURIComponent(productId)}?${params.toString()}`;
}
