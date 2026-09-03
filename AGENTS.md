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
- **Policy Gate.** Any `persist` / `combine` operation MUST call `assertPolicy(providerId, action)`. Cross-provider reconciliation stays **OFF** by default (feature flag + policy) and **never auto-merges** activities.
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

## Ryvano Engineering Protocol

### Mandatory brain-first workflow

Before changing Ryvano code:

1. Read `architecture/PROJECT_MAP.md` first.
2. Identify the domain responsible for the requested behavior.
3. Read only the relevant file under `architecture/modules/`.
4. Read the relevant `architecture/rules/` file and ADR when applicable.
5. Use GitNexus to inspect symbols, call chains, consumers, and blast radius.
6. Determine the smallest safe set of files to change.
7. Inspect the implementation files.
8. Implement the change.
9. Run area-specific tests and project validation.
10. Run GitNexus change-impact analysis against the resulting diff.
11. Fix unexpected cross-domain impact before finishing.

### Selective reading rule

- Do not read the whole architecture directory for every task.
- Load only the project map, the relevant module descriptor, the relevant rules, the relevant ADRs, and the relevant code context.

### Stale index rule

- If GitNexus reports that the repository index is stale, run `gitnexus analyze` and confirm `gitnexus status` before continuing.
- Do not use a stale graph for impact analysis.

### Surgical change rule

- Prefer the minimum coherent change.
- Do not refactor unrelated code.
- Do not rename unrelated symbols.
- Do not move unrelated files.
- Do not rewrite working modules unless the change requires it.
- Every changed file must have a direct reason related to implementation, contract update, migration, tests, or documentation of a changed invariant.

### External documentation rule

- When changing an external provider contract, verify the provider's current official documentation before implementation.
- This applies especially to authentication, OAuth, scopes, webhooks, rate limits, retention, API schemas, token lifecycle, and event payloads.

### Compatibility note

- `docs/ryvano-project-map.md` is a legacy alias only.
- Use `architecture/PROJECT_MAP.md` as the source of truth.
- Keep `architecture/` short enough to consult quickly; do not move all project documentation into `AGENTS.md`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ryano** (9132 symbols, 15333 relationships, 230 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/ryano/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ryano/clusters` | All functional areas |
| `gitnexus://repo/ryano/processes` | All execution flows |
| `gitnexus://repo/ryano/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
