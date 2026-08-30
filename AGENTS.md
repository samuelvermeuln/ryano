<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Integrações esportivas (multi-provider integrations)

This project uses a **provider-agnostic core** with pluggable provider modules. Follow these rules whenever you touch anything under `modules/**` or `app/api/integrations/**`.

### Architecture at a glance

- **Core (provider-agnostic):**
  - `modules/shared/integrations` — catalog (`PROVIDERS`), capabilities, contracts, registry, policy gate.
  - `modules/shared/activities` — `NormalizedActivity`, canonical `RyvanoSportType`, reconciliation, presentation.
  - `modules/shared/reports` — generic queue/delivery + `ReportSectionRequirement`.
- **Provider modules:** `modules/garmin`, `modules/strava` — each plugs into the core through `providerRegistry`.
- **Routes:** thin adapters under `app/api/integrations/**` — no business logic.
- **Secrets:** always via `server/crypto/secret-vault` (encrypted).

### Multi-provider rules (non-negotiable)

- **Never branch on provider identity in shared/core code.** No `if (provider === "strava")` / `if (provider === "garmin")` inside `modules/shared/**` or generic view-models. Decide behavior by **capability** using `hasCapability(providerId, cap)` / `getUserCapabilities(connectedProviders)`, declared in the catalog. Provider-specific logic lives in `modules/<provider>/`.
- **Adding a new provider must not require touching existing modules or the core.** The steps are:
  1. Add it to the catalog (`PROVIDERS`) with the correct availability and **capabilities**.
  2. Implement a module under `modules/<provider>/` satisfying the small contracts (`ActivityProvider` / `RecoveryProvider` / `WebhookProvider`, and `BaseProvider`/`ProviderContext`).
  3. Register the module in `providerRegistry`.
- **Canonical data model.** Normalize every provider payload to `NormalizedActivity` with a canonical `RyvanoSportType`; preserve the raw provider value in `providerSportType`. **Remote DTOs never reach the domain or UI directly** — validate with Zod schemas and map through the module's parsers.
- **Routes are thin adapters.** Auth/parse/delegate only; the business logic belongs to the module.
- **Secrets & privacy.** Read/write tokens only through the secret vault. **Never log tokens, secrets, or PII.** Use the observability helper `logIntegrationEvent` (provider / operation / connection_id / status) for structured logs and provider-labeled metrics.
- **Policy Gate.** Any `persist` / `combine` / `share` / `ai` operation MUST call `assertPolicy(providerId, action)` (plus the AI/share guards). AI processing and third-party sharing are currently **blocked** for all providers (Garmin and Strava included).
- **Cross-provider reconciliation is OFF by default.** It is gated by both a feature flag (`STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED`) and `assertPolicy(..., "combine")`. It **never auto-merges** activities, and single-provider users must never depend on it.
- **Isolation & rate limiting.** Rate limiting is per provider, and provider jobs are isolated: one provider's failure MUST NOT break the others.
- **Nothing is mandatory.** Onboarding, dashboard, activities, and reports must never assume any provider is connected. Sections are **capability-driven** and omit gracefully (no "connect X" hard requirement, no `null`-only-because-not-Garmin).

### MANDATORY official-docs checklist

Before implementing **or changing** any provider integration — OAuth flow, endpoints, scopes, rate limits, webhooks, or data retention/policy — you MUST consult the provider's **current official documentation** and confirm the exact URLs, scopes, limits, and retention rules against it. Cite what you confirmed in the PR/commit. Comply with content licensing: **paraphrase**, do not paste large verbatim excerpts.

- Do **not** implement external contracts from unofficial sources (Stack Overflow, blogs, unofficial SDKs, or AI memory). The final source of truth is the official docs.
- **Heed deprecation notices** and migrate accordingly (e.g. Strava moved from `/oauth/deauthorize` to `/oauth/revoke`).

Strava reference docs (Garmin equivalents apply when working on the Garmin module):

- Authentication / OAuth: https://developers.strava.com/docs/authentication/
- API reference: https://developers.strava.com/docs/reference/
- Rate limits: https://developers.strava.com/docs/rate-limits/
- Webhooks: https://developers.strava.com/docs/webhooks/

For Garmin, consult the current Garmin Connect Developer / Health & Activity API documentation (OAuth, endpoints, scopes, rate limits, and push/ping notifications) before changing `modules/garmin`.
