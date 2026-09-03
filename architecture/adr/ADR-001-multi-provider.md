# ADR-001 — Multi-provider architecture

## Status

Accepted

## Context

Ryvano must support users with zero, one, or many connected sports providers. Garmin and Strava are current providers, but the architecture must remain open to future providers.

## Decision

Treat providers as pluggable modules behind a shared capability-driven core. Shared code should not depend on provider identity when capability checks are enough.

## Consequences

- New providers should enter through catalog + module + registry.
- Shared UI and reports can remain provider-agnostic.
- A failure in one provider should not automatically break another.

## Rules for future changes

- Do not center the architecture on Garmin or Strava.
- Do not branch on provider identity in shared code when a capability is available.