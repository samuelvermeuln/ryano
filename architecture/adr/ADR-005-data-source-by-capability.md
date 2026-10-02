# ADR-005 — Data source by capability, provenance per field

## Status

Accepted (SAM-45, 2026-10-02)

## Context

The rich activity view (map, laps, zones, time series, extended stats) and the daily health indicators (resting heart rate, energy, sleep, HRV, readiness) must work for an athlete who has only Strava, only Garmin, Polar, COROS, Suunto, Fitbit or Amazfit/Zepp — or several of them at once (a Garmin watch mirroring every session into Strava is the common case). Building any of it on one provider's payload would reproduce `if (provider === "GARMIN")` in the core, which `AGENTS.md` forbids, and would leave every other athlete with an empty screen.

ADR-003 keeps cross-provider **reconciliation** (comparing metric values of the same activity) explicit, policy-gated and never automatic. That decision stands; this one is about something narrower: when two connections can feed a screen, **which one feeds each field**.

## Decision

1. **Canonical contracts, provider-agnostic.** `NormalizedActivityDetail` (laps, zone sets, sparse streams, extended stats) and `NormalizedDailyHealth` (per local day) live in `modules/shared/activities/contracts/rich.ts` with Zod schemas. Every field is optional or `null`: **absence is never zero**. Proprietary values (Body Battery, Training Effect, Nightly Recharge, PAI…) are carried as a number plus the provider's own label (`energyScore` + `energyLabel`, `trainingEffect*`), never converted to a common scale.
2. **Provenance per field.** Each block of a detail and each daily-health field knows its `MetricSource` (`provider`, `native | derived`). The UI shows it ("Zonas: Garmin (nativas)", "Sono: Garmin · FC de repouso: Polar").
3. **Capabilities are the only switch.** The catalog declares, per provider, the fine capabilities the detail and the health screens depend on (`laps`, `streams`, `nativeHeartRateZones`, `routeGps`, `swimMetrics`, `trainingEffect`, `bodyBattery`, `temperature`, `calorieBreakdown`, `dailyHealth`, `restingHeartRate`, `steps`). Modules implement the small contracts `ActivityDetailProvider` and `DailyHealthProvider`; `findCapabilityContractViolations` (registry contract test) fails when a registered module declares a capability without the contract or the reverse. **Adding a provider is catalog + module + registry**, also for detail and health.
4. **Source resolution, not reconciliation.** `modules/shared/activities/source-resolution` is pure and chooses **one provider per block/field** and labels it:
   - activity detail: with cross-provider combination **disabled** (the Policy Gate's default) the whole detail comes from the primary connection (athlete preference, else catalog order); blocks that connection lacks stay absent even if another connection has them. With combination allowed by policy, each block comes whole from the best source (native zones over derived, the series with GPS and more samples), still labelled.
   - daily health: one connection per field, by preference order, then by the most recent `fetchedAt`.
   - the same session arriving from two connections (`findDuplicateSessions`: same canonical sport, starts within 10 min, duration or distance within 15%) is **one** session; the preferred connection is kept and the other is marked as its duplicate, never shown twice and never matched twice (SAM-33).
5. **Graceful omission.** No screen requires a provider. A card, a section or a map that has no source does not render; derived zones are shown as estimated.

## Consequences

- SAM-38 (storage), SAM-39 (ingestion), SAM-40 (screen), SAM-42/43 (daily health) build on these contracts and never read `metrics.garminActivityDetails` / `metrics.stravaActivityDetails` directly.
- A provider implemented later (Polar, COROS, Suunto, Fitbit, Amazfit/Zepp) only needs the official-docs checklist of `AGENTS.md`, its module and its catalog entry.
- Field-level mixing of two providers in one record remains a policy decision (`allowCrossProviderCombination`), off by default, as ADR-003 requires.

## Rules for future changes

- Never compare `providerId` to a literal outside `modules/<provider>/`.
- Never fill a missing value with `0`; never convert a proprietary score to another provider's scale.
- Never merge two providers inside one block or one field; choose and label.
